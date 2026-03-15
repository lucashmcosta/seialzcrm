import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from 'sonner';

export interface KommoCredentials {
  subdomain: string;
  access_token: string;
  account_name?: string;
}

export interface KommoPipeline {
  id: number;
  name: string;
  stages: {
    id: number;
    name: string;
    sort: number;
    color?: string;
    type?: number;
  }[];
}

export interface StageMapping {
  [kommoStageKey: string]: string;
}

export interface MigrationConfig {
  duplicate_mode: 'skip' | 'update' | 'create';
  import_orphan_contacts: boolean;
  import_companies: boolean;
  import_tasks: boolean;
  import_notes: boolean;
  import_events: boolean;
  import_custom_fields: boolean;
}

export interface KommoUserMapping {
  kommo_user_id: number;
  kommo_user_name: string;
  kommo_user_email: string | null;
  seialz_user_id: string | null;
}

export interface ImportLog {
  id: string;
  organization_id: string;
  integration_slug: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  total_contacts: number;
  imported_contacts: number;
  skipped_contacts: number;
  total_opportunities: number;
  imported_opportunities: number;
  skipped_opportunities: number;
  total_companies: number;
  imported_companies: number;
  total_tasks: number;
  imported_tasks: number;
  total_notes: number;
  imported_notes: number;
  total_events: number;
  imported_events: number;
  total_custom_fields: number;
  imported_custom_fields: number;
  progress_percent: number;
  last_processed_item: string | null;
  config: any;
  cursor_state?: any;
  imported_contact_ids: string[];
  imported_opportunity_ids: string[];
  imported_company_ids: string[];
  imported_task_ids: string[];
  imported_activity_ids: string[];
  rollback_available: boolean;
  rollback_executed_at: string | null;
  errors: any[];
  error_count: number;
}

export type MigrationPhase = 
  | 'users' | 'pipelines' | 'custom_fields' | 'companies' 
  | 'contacts' | 'leads' | 'tasks' 
  | 'notes_contacts' | 'notes_leads' | 'events';

export const PHASE_LABELS: Record<MigrationPhase, string> = {
  users: 'Usuários',
  pipelines: 'Pipelines',
  custom_fields: 'Campos customizados',
  companies: 'Empresas',
  contacts: 'Contatos',
  leads: 'Oportunidades',
  tasks: 'Tarefas',
  notes_contacts: 'Notas (contatos)',
  notes_leads: 'Notas (leads)',
  events: 'Eventos',
};

export const PHASE_ORDER: MigrationPhase[] = [
  'users', 'pipelines', 'custom_fields', 'companies',
  'contacts', 'leads', 'tasks',
  'notes_contacts', 'notes_leads', 'events',
];

export function useKommoMigration() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState(1);
  const [credentials, setCredentials] = useState<KommoCredentials | null>(null);
  const [kommoPipelines, setKommoPipelines] = useState<KommoPipeline[]>([]);
  const [stageMapping, setStageMapping] = useState<StageMapping>({});
  const [userMappings, setUserMappings] = useState<KommoUserMapping[]>([]);
  const [config, setConfig] = useState<MigrationConfig>({
    duplicate_mode: 'skip',
    import_orphan_contacts: true,
    import_companies: true,
    import_tasks: true,
    import_notes: true,
    import_events: true,
    import_custom_fields: true,
  });
  const [importLogId, setImportLogId] = useState<string | null>(null);
  const [importLog, setImportLog] = useState<ImportLog | null>(null);
  const [credentialsInitialized, setCredentialsInitialized] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  // Query para buscar credenciais já salvas na integração conectada
  const { data: savedCredentials, isLoading: isLoadingCredentials } = useQuery({
    queryKey: ['kommo-saved-credentials', organization?.id],
    queryFn: async () => {
      if (!organization) return null;
      
      const { data } = await supabase
        .from('organization_integrations')
        .select(`
          config_values,
          admin_integrations!inner(slug)
        `)
        .eq('organization_id', organization.id)
        .eq('admin_integrations.slug', 'kommo')
        .eq('is_enabled', true)
        .maybeSingle();
      
      if (data?.config_values) {
        const configValues = data.config_values as any;
        let subdomain = configValues.subdomain || '';
        if (subdomain.includes('.kommo.com')) {
          subdomain = subdomain.replace('.kommo.com', '');
        }
        
        return {
          subdomain,
          access_token: configValues.access_token,
          account_name: configValues.account_name || subdomain,
        } as KommoCredentials;
      }
      return null;
    },
    enabled: !!organization,
  });

  // Query para buscar usuários do CRM via user_organizations
  const { data: crmUsers } = useQuery({
    queryKey: ['crm-users', organization?.id],
    queryFn: async () => {
      if (!organization) return [];
      const { data, error } = await supabase
        .from('user_organizations')
        .select('user_id, users!inner(id, full_name, email)')
        .eq('organization_id', organization.id)
        .eq('is_active', true);
      if (error) throw error;
      return (data || []).map((uo: any) => uo.users).filter(Boolean);
    },
    enabled: !!organization,
  });

  // Query para buscar migração em andamento
  const { data: pendingImport, refetch: refetchPendingImport } = useQuery({
    queryKey: ['kommo-pending-import', organization?.id],
    queryFn: async () => {
      if (!organization) return null;
      
      const { data } = await supabase
        .from('import_logs')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('integration_slug', 'kommo')
        .in('status', ['running', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const cfg = data?.config as Record<string, any> | null;
      if (cfg?.subdomain && cfg?.access_token) {
        return data as ImportLog | null;
      }
      
      return null;
    },
    enabled: !!organization,
  });

  // Inicializar credentials com dados salvos e pular para step 2
  useEffect(() => {
    if (savedCredentials && !credentialsInitialized) {
      setCredentials(savedCredentials);
      setStep(2);
      setCredentialsInitialized(true);
    }
  }, [savedCredentials, credentialsInitialized]);

  // Fetch CRM pipeline stages
  const { data: crmStages } = useQuery({
    queryKey: ['pipeline-stages', organization?.id],
    queryFn: async () => {
      if (!organization) return [];
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('organization_id', organization.id)
        .order('order_index');
      if (error) throw error;
      return data;
    },
    enabled: !!organization,
  });

  // Validate credentials mutation
  const validateMutation = useMutation({
    mutationFn: async (creds: { subdomain: string; access_token: string }) => {
      const { data, error } = await supabase.functions.invoke('kommo-validate', {
        body: creds,
      });
      if (error) throw error;
      return data;
    },
  });

  // Fetch pipelines mutation
  const fetchPipelinesMutation = useMutation({
    mutationFn: async (creds: KommoCredentials) => {
      const { data, error } = await supabase.functions.invoke('kommo-fetch-pipelines', {
        body: { subdomain: creds.subdomain, access_token: creds.access_token },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setKommoPipelines(data.pipelines || []);
      // Extract users from pipeline data if available
      if (data.users && Array.isArray(data.users)) {
        setUserMappings(data.users.map((u: any) => ({
          kommo_user_id: u.id,
          kommo_user_name: u.name || `Usuário ${u.id}`,
          kommo_user_email: u.email || null,
          seialz_user_id: null,
        })));
      }
    },
  });

  // Fetch preview mutation
  const previewMutation = useMutation({
    mutationFn: async (creds: KommoCredentials) => {
      const { data, error } = await supabase.functions.invoke('kommo-preview', {
        body: { subdomain: creds.subdomain, access_token: creds.access_token },
      });
      if (error) throw error;
      return data;
    },
  });

  // Start migration mutation
  const startMigrationMutation = useMutation({
    mutationFn: async () => {
      if (!organization || !credentials) throw new Error('Dados incompletos');

      const insertPayload = {
        organization_id: organization.id,
        integration_slug: 'kommo',
        status: 'pending',
        config: {
          ...config,
          stage_mapping: stageMapping,
          user_mappings: userMappings.filter(m => m.seialz_user_id),
          subdomain: credentials.subdomain,
          access_token: credentials.access_token,
        } as any,
      };

      const { data: log, error: logError } = await supabase
        .from('import_logs')
        .insert(insertPayload)
        .select()
        .single();

      if (logError) throw logError;
      setImportLogId(log.id);

      let shouldContinue = true;
      let isFirstCall = true;

      while (shouldContinue) {
        const { data, error } = await supabase.functions.invoke('kommo-migrate', {
          body: isFirstCall ? {
            import_log_id: log.id,
            organization_id: organization.id,
            subdomain: credentials.subdomain,
            access_token: credentials.access_token,
            stage_mapping: stageMapping,
            user_mappings: userMappings.filter(m => m.seialz_user_id),
            duplicate_mode: config.duplicate_mode,
            import_orphan_contacts: config.import_orphan_contacts,
            import_companies: config.import_companies,
            import_tasks: config.import_tasks,
            import_notes: config.import_notes,
            import_events: config.import_events,
            import_custom_fields: config.import_custom_fields,
          } : {
            import_log_id: log.id,
          },
        });

        isFirstCall = false;

        if (error) {
          console.error('Migration chunk error:', error);
          throw error;
        }

        shouldContinue = data?.continue === true;

        if (shouldContinue) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      return { success: true };
    },
    onError: (error: any) => {
      toast.error(`Erro ao iniciar migração: ${error.message}`);
    },
  });

  // Rollback mutation
  const rollbackMutation = useMutation({
    mutationFn: async (logId: string) => {
      const { data, error } = await supabase.functions.invoke('kommo-rollback', {
        body: { import_log_id: logId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Rollback concluído com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: (error: any) => {
      toast.error(`Erro no rollback: ${error.message}`);
    },
  });

  // Subscribe to realtime updates for import log
  useEffect(() => {
    if (!importLogId) return;

    const channel = supabase
      .channel(`import-log-${importLogId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'import_logs',
          filter: `id=eq.${importLogId}`,
        },
        (payload) => {
          setImportLog(payload.new as ImportLog);
        }
      )
      .subscribe();

    supabase
      .from('import_logs')
      .select('*')
      .eq('id', importLogId)
      .single()
      .then(({ data }) => {
        if (data) setImportLog(data as ImportLog);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [importLogId]);

  // Helper to get current phase from cursor_state
  const getCurrentPhase = useCallback((): MigrationPhase | null => {
    if (!importLog?.cursor_state) return null;
    return importLog.cursor_state.phase || null;
  }, [importLog]);

  const reset = useCallback(() => {
    const initialStep = savedCredentials ? 2 : 1;
    setStep(initialStep);
    setCredentials(savedCredentials || null);
    setKommoPipelines([]);
    setStageMapping({});
    setUserMappings([]);
    setConfig({
      duplicate_mode: 'skip',
      import_orphan_contacts: true,
      import_companies: true,
      import_tasks: true,
      import_notes: true,
      import_events: true,
      import_custom_fields: true,
    });
    setImportLogId(null);
    setImportLog(null);
    setCredentialsInitialized(!!savedCredentials);
    setIsResuming(false);
    refetchPendingImport();
  }, [savedCredentials, refetchPendingImport]);

  const goToStep = useCallback((newStep: number) => {
    setStep(newStep);
  }, []);

  const resumeMigration = useCallback(async () => {
    if (!pendingImport) return;
    
    setIsResuming(true);
    setImportLogId(pendingImport.id);
    setImportLog(pendingImport);
    setStep(5);
    
    try {
      let shouldContinue = true;
      
      while (shouldContinue) {
        const { data, error } = await supabase.functions.invoke('kommo-migrate', {
          body: { import_log_id: pendingImport.id },
        });
        
        if (error) {
          console.error('Resume migration error:', error);
          toast.error(`Erro ao retomar migração: ${error.message}`);
          break;
        }
        
        shouldContinue = data?.continue === true;
        
        if (shouldContinue) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      refetchPendingImport();
    } finally {
      setIsResuming(false);
    }
  }, [pendingImport, queryClient, refetchPendingImport]);

  const cancelPendingMigration = useCallback(async () => {
    if (!pendingImport) return;
    
    try {
      await supabase
        .from('import_logs')
        .update({ 
          status: 'cancelled',
          completed_at: new Date().toISOString()
        })
        .eq('id', pendingImport.id);
      
      toast.success('Migração cancelada');
      refetchPendingImport();
    } catch (error: any) {
      toast.error(`Erro ao cancelar: ${error.message}`);
    }
  }, [pendingImport, refetchPendingImport]);

  return {
    // State
    step,
    credentials,
    kommoPipelines,
    stageMapping,
    userMappings,
    config,
    importLogId,
    importLog,
    crmStages,
    crmUsers,
    savedCredentials,
    isLoadingCredentials,
    pendingImport,
    isResuming,

    // Setters
    setCredentials,
    setStageMapping,
    setUserMappings,
    setConfig,
    goToStep,
    reset,

    // Computed
    getCurrentPhase,

    // Actions
    resumeMigration,
    cancelPendingMigration,

    // Mutations
    validateMutation,
    fetchPipelinesMutation,
    previewMutation,
    startMigrationMutation,
    rollbackMutation,
  };
}

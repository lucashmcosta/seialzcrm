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
  [kommoStageKey: string]: string; // "pipeline_stage" -> crm_stage_id
}

export interface MigrationConfig {
  duplicate_mode: 'skip' | 'update' | 'create';
  import_orphan_contacts: boolean;
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
  progress_percent: number;
  last_processed_item: string | null;
  config: any;
  cursor_state?: any;
  imported_contact_ids: string[];
  imported_opportunity_ids: string[];
  rollback_available: boolean;
  rollback_executed_at: string | null;
  errors: any[];
  error_count: number;
}

export function useKommoMigration() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState(1);
  const [credentials, setCredentials] = useState<KommoCredentials | null>(null);
  const [kommoPipelines, setKommoPipelines] = useState<KommoPipeline[]>([]);
  const [stageMapping, setStageMapping] = useState<StageMapping>({});
  const [config, setConfig] = useState<MigrationConfig>({
    duplicate_mode: 'skip',
    import_orphan_contacts: true,
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
        // Limpar subdomain se veio com .kommo.com
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

  // Query para buscar migração em andamento (running ou paused)
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
      
      // Verificar se o registro tem credenciais válidas no config
      const config = data?.config as Record<string, any> | null;
      if (config?.subdomain && config?.access_token) {
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
      setStep(2); // Pular direto para mapeamento
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

  // Start migration mutation - creates log and starts chunked processing
  const startMigrationMutation = useMutation({
    mutationFn: async () => {
      if (!organization || !credentials) throw new Error('Dados incompletos');

      // Create import log
      const { data: log, error: logError } = await supabase
        .from('import_logs')
        .insert({
          organization_id: organization.id,
          integration_slug: 'kommo',
          status: 'pending',
          config: {
            ...config,
            stage_mapping: stageMapping,
            subdomain: credentials.subdomain,
            access_token: credentials.access_token,
          },
        })
        .select()
        .single();

      if (logError) throw logError;
      setImportLogId(log.id);

      // Start chunked migration loop
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
            duplicate_mode: config.duplicate_mode,
            import_orphan_contacts: config.import_orphan_contacts,
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

        // Small delay between chunks to avoid overwhelming
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

    // Also fetch initial state
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

  const reset = useCallback(() => {
    // Se tem credenciais salvas, volta para step 2 (mapeamento), senão step 1
    const initialStep = savedCredentials ? 2 : 1;
    setStep(initialStep);
    setCredentials(savedCredentials || null);
    setKommoPipelines([]);
    setStageMapping({});
    setConfig({
      duplicate_mode: 'skip',
      import_orphan_contacts: true,
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

  // Função para retomar migração pendente
  const resumeMigration = useCallback(async () => {
    if (!pendingImport) return;
    
    setIsResuming(true);
    setImportLogId(pendingImport.id);
    setImportLog(pendingImport);
    setStep(4); // Ir para tela de progresso
    
    try {
      // Retomar loop de processamento
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
      
      // Invalidar queries após conclusão
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      refetchPendingImport();
    } finally {
      setIsResuming(false);
    }
  }, [pendingImport, queryClient, refetchPendingImport]);

  // Função para cancelar migração pendente
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
    config,
    importLogId,
    importLog,
    crmStages,
    savedCredentials,
    isLoadingCredentials,
    pendingImport,
    isResuming,

    // Setters
    setCredentials,
    setStageMapping,
    setConfig,
    goToStep,
    reset,

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

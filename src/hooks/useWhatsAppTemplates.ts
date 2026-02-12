import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { whatsappService, WhatsAppTemplate, CreateTemplateInput, SendTemplateInput } from '@/services/whatsapp';
import { useToast } from '@/hooks/use-toast';

export function useTemplates(orgId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['whatsapp-templates', orgId],
    queryFn: async () => {
      const templates = await whatsappService.listTemplates(orgId!);
      // Filtrar apenas templates ativos (soft delete retorna is_active = false)
      return templates.filter(t => t.is_active !== false);
    },
    enabled: !!orgId,
  });

  // Subscribe to realtime changes - effect runs after initial render
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`whatsapp-templates-list-${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_templates',
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          console.log('[Realtime] WhatsApp template change:', payload.eventType);
          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ['whatsapp-templates', orgId] });
          queryClient.invalidateQueries({ queryKey: ['whatsapp-template'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]); // queryClient is stable, no need in deps

  return query;
}

export function useTemplate(orgId: string | undefined, templateId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['whatsapp-template', orgId, templateId],
    queryFn: () => whatsappService.getTemplate(orgId!, templateId!),
    enabled: !!orgId && !!templateId,
  });

  // Subscribe to realtime changes for this specific template
  useEffect(() => {
    if (!orgId || !templateId) return;

    const channel = supabase
      .channel(`whatsapp-template-detail-${templateId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_templates',
          filter: `id=eq.${templateId}`,
        },
        (payload) => {
          console.log('[Realtime] Template updated:', payload.new);
          // Invalidate to refresh
          queryClient.invalidateQueries({ queryKey: ['whatsapp-template', orgId, templateId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, templateId]); // queryClient is stable, no need in deps

  return query;
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: CreateTemplateInput) => whatsappService.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast({ description: 'Template criado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', description: error.message });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateTemplateInput> }) =>
      whatsappService.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-template'] });
      toast({ description: 'Template atualizado!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', description: error.message });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ orgId, templateId }: { orgId: string; templateId: string }) =>
      whatsappService.deleteTemplate(orgId, templateId),
    
    // Atualização otimista - remove da lista antes da resposta do servidor
    onMutate: async ({ orgId, templateId }) => {
      // Cancelar queries em andamento para evitar conflitos
      await queryClient.cancelQueries({ queryKey: ['whatsapp-templates', orgId] });
      
      // Snapshot do estado anterior para rollback
      const previousTemplates = queryClient.getQueryData<WhatsAppTemplate[]>(['whatsapp-templates', orgId]);
      
      // Remover otimisticamente da cache
      queryClient.setQueryData<WhatsAppTemplate[]>(
        ['whatsapp-templates', orgId],
        (old) => old?.filter(t => t.id !== templateId) || []
      );
      
      return { previousTemplates, orgId };
    },
    
    // Reverter em caso de erro
    onError: (err: Error, { orgId }, context) => {
      if (context?.previousTemplates) {
        queryClient.setQueryData(['whatsapp-templates', orgId], context.previousTemplates);
      }
      toast({ variant: 'destructive', description: err.message });
    },
    
    // Sincronizar com servidor após mutação (sucesso ou erro)
    onSettled: (_data, _error, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates', orgId] });
    },
    
    onSuccess: () => {
      toast({ description: 'Template removido!' });
    },
  });
}

export function useSyncTemplates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orgId: string) => {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-templates', {
        body: { action: 'sync', organizationId: orgId },
      });
      if (error) throw new Error(error.message || 'Erro ao sincronizar templates');
      return data as { synced: number; total: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast({ description: `${data.synced} templates sincronizados!` });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', description: error.message });
    },
  });
}

export function useSubmitForApproval() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ orgId, templateId, category }: { orgId: string; templateId: string; category: string }) => {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-templates', {
        body: { action: 'submit-approval', organizationId: orgId, templateId, category },
      });
      if (error) throw new Error(error.message || 'Erro ao submeter para aprovação');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-template'] });
      toast({ description: 'Template submetido para aprovação!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', description: error.message });
    },
  });
}

export function useSendTemplate() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: SendTemplateInput) => whatsappService.sendTemplate(data),
    onSuccess: () => {
      toast({ description: 'Mensagem enviada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', description: error.message });
    },
  });
}

// Re-export types for convenience
export type { WhatsAppTemplate, CreateTemplateInput, SendTemplateInput };

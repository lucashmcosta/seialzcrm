import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { whatsappService, WhatsAppTemplate, CreateTemplateInput, SendTemplateInput } from '@/services/whatsapp';
import { useToast } from '@/hooks/use-toast';

export function useTemplates(orgId: string | undefined) {
  const queryClient = useQueryClient();

  // Subscribe to realtime changes
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`whatsapp_templates_${orgId}`)
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
  }, [orgId, queryClient]);

  return useQuery({
    queryKey: ['whatsapp-templates', orgId],
    queryFn: () => whatsappService.listTemplates(orgId!),
    enabled: !!orgId,
  });
}

export function useTemplate(orgId: string | undefined, templateId: string | undefined) {
  const queryClient = useQueryClient();

  // Subscribe to realtime changes for this specific template
  useEffect(() => {
    if (!orgId || !templateId) return;

    const channel = supabase
      .channel(`whatsapp_template_${templateId}`)
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
  }, [orgId, templateId, queryClient]);

  return useQuery({
    queryKey: ['whatsapp-template', orgId, templateId],
    queryFn: () => whatsappService.getTemplate(orgId!, templateId!),
    enabled: !!orgId && !!templateId,
  });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast({ description: 'Template removido!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', description: error.message });
    },
  });
}

export function useSyncTemplates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (orgId: string) => whatsappService.syncWithTwilio(orgId),
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
    mutationFn: ({ orgId, templateId, category }: { orgId: string; templateId: string; category: string }) =>
      whatsappService.submitForApproval(orgId, templateId, category),
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

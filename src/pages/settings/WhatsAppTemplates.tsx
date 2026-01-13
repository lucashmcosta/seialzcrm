import { useState } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CreateTemplateDialog } from '@/components/whatsapp/CreateTemplateDialog';
import { 
  RefreshCw, 
  Plus, 
  Trash2, 
  Clock, 
  CheckCircle, 
  XCircle,
  MessageSquare,
  Loader2,
  AlertCircle
} from 'lucide-react';

interface Template {
  id: string;
  twilio_content_sid: string;
  friendly_name: string;
  body: string;
  language: string;
  category: string | null;
  status: string;
  template_type: string;
  variables: unknown;
  last_synced_at: string | null;
  created_at: string;
  is_active: boolean;
}

export default function WhatsAppTemplates() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  // Fetch templates
  const { data: templates, isLoading, refetch } = useQuery({
    queryKey: ['whatsapp-templates', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('friendly_name');

      if (error) throw error;
      return (data || []) as Template[];
    },
    enabled: !!organization?.id,
  });

  // Sync templates mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-templates', {
        body: {
          organizationId: organization?.id,
          action: 'sync',
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({
        description: `${data.synced || 0} templates sincronizados do Twilio`,
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        description: error.message || 'Erro ao sincronizar templates',
      });
    },
  });

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-templates', {
        method: 'DELETE',
        body: {
          organizationId: organization?.id,
          templateId,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ description: 'Template removido com sucesso' });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      setDeleteConfirmOpen(false);
      setSelectedTemplate(null);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        description: error.message || 'Erro ao remover template',
      });
    },
  });

  const handleDelete = (template: Template) => {
    setSelectedTemplate(template);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (selectedTemplate) {
      deleteMutation.mutate(selectedTemplate.id);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="w-3 h-3 mr-1" />
            Aprovado
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="w-3 h-3 mr-1" />
            Pendente
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Rejeitado
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <AlertCircle className="w-3 h-3 mr-1" />
            {status}
          </Badge>
        );
    }
  };

  const getCategoryLabel = (category: string | null) => {
    switch (category) {
      case 'marketing':
        return 'Marketing';
      case 'utility':
        return 'Utilidade';
      case 'authentication':
        return 'Autenticação';
      default:
        return category || 'Geral';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Templates WhatsApp</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie os templates de mensagem para WhatsApp Business
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sincronizar
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Criar Template
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <MessageSquare className="w-5 h-5 text-green-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Templates são necessários para iniciar conversas</p>
              <p className="text-muted-foreground mt-1">
                O WhatsApp exige templates aprovados para enviar mensagens fora da janela de 24 horas.
                Templates precisam ser aprovados pelo WhatsApp antes de serem usados.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Templates List */}
      {!templates || templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">Nenhum template encontrado</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Crie um novo template ou sincronize os existentes do Twilio
            </p>
            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Sincronizar do Twilio
              </Button>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Template
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-400px)]">
          <div className="grid gap-4">
            {templates.map((template) => (
              <Card key={template.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        {template.friendly_name}
                        {getStatusBadge(template.status)}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        <span className="inline-flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {getCategoryLabel(template.category)}
                          </Badge>
                          <span className="text-xs">
                            Idioma: {template.language || 'pt-BR'}
                          </span>
                        </span>
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(template)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-sm whitespace-pre-wrap">{template.body}</p>
                  </div>
                  {template.last_synced_at && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Última sincronização: {new Date(template.last_synced_at).toLocaleString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Create Template Dialog */}
      <CreateTemplateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => {
          refetch();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Remover Template"
        description={`Tem certeza que deseja remover o template "${selectedTemplate?.friendly_name}"? Esta ação não pode ser desfeita.`}
        confirmText="Remover"
        cancelText="Cancelar"
        variant="destructive"
        onConfirm={confirmDelete}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

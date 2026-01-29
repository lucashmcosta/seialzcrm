import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PhoneInput } from '@/components/ui/phone-input';
import { ApprovalStatusBadge } from '@/components/whatsapp/templates/ApprovalStatusBadge';
import { WhatsAppPreview } from '@/components/whatsapp/templates/WhatsAppPreview';
import {
  useTemplate,
  useDeleteTemplate,
  useSubmitForApproval,
  useSendTemplate,
} from '@/hooks/useWhatsAppTemplates';
import { useOrganization } from '@/hooks/useOrganization';
import { extractVariables } from '@/lib/template-validation';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Send,
  Loader2,
  AlertCircle,
  Clock,
  Calendar,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function TemplateDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { organization } = useOrganization();

  const { data: template, isLoading } = useTemplate(organization?.id, id);
  const deleteMutation = useDeleteTemplate();
  const submitMutation = useSubmitForApproval();
  const sendMutation = useSendTemplate();

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('UTILITY');
  const [testPhone, setTestPhone] = useState('');
  const [testVariables, setTestVariables] = useState<Record<string, string>>({});

  const detectedVariables = template ? extractVariables(template.body) : [];

  const handleDelete = async () => {
    if (!organization?.id || !id) return;
    await deleteMutation.mutateAsync({ orgId: organization.id, templateId: id });
    navigate('/whatsapp/templates');
  };

  const openSubmitDialog = () => {
    setSelectedCategory(template?.category || 'UTILITY');
    setSubmitDialogOpen(true);
  };

  const confirmSubmitForApproval = async () => {
    if (!organization?.id || !id) return;
    await submitMutation.mutateAsync({
      orgId: organization.id,
      templateId: id,
      category: selectedCategory,
    });
    setSubmitDialogOpen(false);
  };

  const handleTestSend = async () => {
    if (!organization?.id || !id || !testPhone) return;
    await sendMutation.mutateAsync({
      organization_id: organization.id,
      to: testPhone,
      template_id: id,
      variables: testVariables,
    });
  };

  const handleTestVariableChange = (key: string, value: string) => {
    setTestVariables(prev => ({ ...prev, [key]: value }));
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'text': 'Texto',
      'quick-reply': 'Resposta Rápida',
      'list-picker': 'Lista',
      'call-to-action': 'Call-to-Action',
      'media': 'Mídia',
    };
    return labels[type] || type;
  };

  const getCategoryLabel = (category: string | null | undefined) => {
    const labels: Record<string, string> = {
      'UTILITY': 'Utilidade',
      'MARKETING': 'Marketing',
      'AUTHENTICATION': 'Autenticação',
    };
    return labels[category || ''] || category || 'N/A';
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
            <Skeleton className="h-80" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!template) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Template não encontrado</p>
          <Button variant="link" onClick={() => navigate('/whatsapp/templates')}>
            Voltar para lista
          </Button>
        </div>
      </Layout>
    );
  }

  const canEdit = template.status !== 'approved';
  const canSubmit = template.status === 'not_submitted' || template.status === 'draft';
  const canTest = template.status === 'approved';

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/whatsapp/templates')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{template.friendly_name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <ApprovalStatusBadge status={template.status} />
                <Badge variant="outline">{getTypeLabel(template.template_type)}</Badge>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {canEdit && (
              <Button
                variant="outline"
                onClick={() => navigate(`/whatsapp/templates/${id}/edit`)}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Editar
              </Button>
            )}
            {canSubmit && (
              <Button
                variant="outline"
                onClick={openSubmitDialog}
                disabled={submitMutation.isPending}
              >
                <Send className="w-4 h-4 mr-2" />
                Submeter para Aprovação
              </Button>
            )}
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </Button>
          </div>
        </div>

        {/* Rejection reason */}
        {template.status === 'rejected' && template.rejection_reason && (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">Template Rejeitado</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {template.rejection_reason}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending approval notice */}
        {template.status === 'pending' && (
          <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-950/30">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800 dark:text-yellow-400">
                    Aguardando Aprovação do WhatsApp
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-500 mt-1">
                    Este template foi submetido e está aguardando revisão do WhatsApp. 
                    O processo pode levar de alguns minutos a 24 horas.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Details */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Informações do Template</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Idioma</Label>
                    <p className="font-medium">{template.language}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Categoria</Label>
                    <p className="font-medium">{getCategoryLabel(template.category)}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground">Corpo da Mensagem</Label>
                  <div className="mt-1 p-3 bg-muted rounded-lg">
                    <p className="text-sm whitespace-pre-wrap">{template.body}</p>
                  </div>
                </div>

                {template.header && (
                  <div>
                    <Label className="text-muted-foreground">Header</Label>
                    <p className="font-medium">{template.header}</p>
                  </div>
                )}

                {template.footer && (
                  <div>
                    <Label className="text-muted-foreground">Footer</Label>
                    <p className="font-medium">{template.footer}</p>
                  </div>
                )}

                <div className="flex items-center gap-4 text-sm text-muted-foreground pt-4 border-t">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>Criado em {format(new Date(template.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                  {template.last_synced_at && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>Sincronizado em {format(new Date(template.last_synced_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Test send */}
            {canTest && (
              <Card>
                <CardHeader>
                  <CardTitle>Testar Envio</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <PhoneInput
                      value={testPhone}
                      onChange={setTestPhone}
                      placeholder="(11) 99999-9999"
                    />
                  </div>

                  {detectedVariables.length > 0 && (
                    <div className="space-y-3">
                      <Label>Variáveis</Label>
                      {detectedVariables.map((key, index) => {
                        const templateVar = template.variables?.[index];
                        return (
                          <div key={key} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
                                {key}
                              </span>
                              {templateVar?.name && (
                                <span className="text-xs text-muted-foreground">
                                  {templateVar.name}
                                </span>
                              )}
                            </div>
                            <Input
                              placeholder={templateVar?.example || `Valor para ${key}`}
                              value={testVariables[key] || ''}
                              onChange={(e) => handleTestVariableChange(key, e.target.value)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <Button
                    onClick={handleTestSend}
                    disabled={!testPhone || sendMutation.isPending}
                    className="w-full"
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Enviar Teste
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Preview */}
          <div>
            <Label className="mb-2 block">Prévia</Label>
            <WhatsAppPreview
              body={template.body}
              header={template.header}
              footer={template.footer}
              variables={template.variables || []}
              buttons={template.buttons || []}
              actions={template.actions || []}
            />
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Excluir Template"
        description={`Tem certeza que deseja excluir o template "${template.friendly_name}"? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleteMutation.isPending}
      />

      {/* Submit for Approval Dialog */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Submeter para Aprovação</DialogTitle>
            <DialogDescription>
              Selecione a categoria do template "{template.friendly_name}" antes de submeter.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3">
            <Label>Categoria</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UTILITY">Utilidade</SelectItem>
                <SelectItem value="MARKETING">Marketing</SelectItem>
                <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              A categoria determina as regras de envio e custos do WhatsApp.
            </p>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={confirmSubmitForApproval} 
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Submeter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

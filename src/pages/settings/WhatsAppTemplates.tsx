import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';
import { ApprovalStatusBadge } from '@/components/whatsapp/templates/ApprovalStatusBadge';
import { 
  useTemplates, 
  useDeleteTemplate, 
  useSyncTemplates,
  useSubmitForApproval,
} from '@/hooks/useWhatsAppTemplates';
import { useOrganization } from '@/hooks/useOrganization';
import { 
  Plus, 
  RefreshCw, 
  MoreHorizontal, 
  Eye, 
  Pencil, 
  Trash2, 
  Send,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type FilterStatus = 'all' | 'approved' | 'pending' | 'rejected' | 'not_submitted' | 'draft';
type FilterType = 'all' | 'text' | 'quick-reply' | 'list-picker' | 'call-to-action' | 'media';
type FilterLanguage = 'all' | 'pt_BR' | 'pt-BR' | 'en' | 'es';

export default function WhatsAppTemplates() {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const { data: templates, isLoading } = useTemplates(organization?.id);
  const deleteMutation = useDeleteTemplate();
  const syncMutation = useSyncTemplates();
  const submitMutation = useSubmitForApproval();

  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterLanguage, setFilterLanguage] = useState<FilterLanguage>('all');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('');
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('UTILITY');

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return templates?.filter(template => {
      if (filterStatus !== 'all' && template.status !== filterStatus) return false;
      if (filterType !== 'all' && template.template_type !== filterType) return false;
      if (filterLanguage !== 'all' && template.language !== filterLanguage) return false;
      return true;
    }) || [];
  }, [templates, filterStatus, filterType, filterLanguage]);

  const handleDelete = (templateId: string, templateName: string) => {
    setSelectedTemplateId(templateId);
    setSelectedTemplateName(templateName);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (selectedTemplateId && organization?.id) {
      await deleteMutation.mutateAsync({
        orgId: organization.id,
        templateId: selectedTemplateId,
      });
      setDeleteConfirmOpen(false);
      setSelectedTemplateId(null);
    }
  };

  const handleSync = () => {
    if (organization?.id) {
      syncMutation.mutate(organization.id);
    }
  };

  const openSubmitDialog = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setSelectedCategory('UTILITY');
    setSubmitDialogOpen(true);
  };

  const confirmSubmitForApproval = async () => {
    if (selectedTemplateId && organization?.id) {
      await submitMutation.mutateAsync({
        orgId: organization.id,
        templateId: selectedTemplateId,
        category: selectedCategory,
      });
      setSubmitDialogOpen(false);
      setSelectedTemplateId(null);
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'text': 'Texto',
      'quick-reply': 'Resposta Rápida',
      'list-picker': 'Lista',
      'call-to-action': 'CTA',
      'media': 'Mídia',
    };
    return labels[type] || type;
  };

  const getLanguageLabel = (lang: string) => {
    const labels: Record<string, string> = {
      'pt_BR': 'Português',
      'pt-BR': 'Português',
      'en': 'English',
      'es': 'Español',
    };
    return labels[lang] || lang;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">WhatsApp Templates</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie templates de mensagem para WhatsApp Business
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sincronizar
          </Button>
          <Button onClick={() => navigate('/whatsapp/templates/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Template
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            <SelectItem value="approved">Aprovado</SelectItem>
            <SelectItem value="pending">Aguardando Aprovação</SelectItem>
            <SelectItem value="rejected">Rejeitado</SelectItem>
            <SelectItem value="not_submitted">Não Submetido</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Tipos</SelectItem>
            <SelectItem value="text">Texto</SelectItem>
            <SelectItem value="quick-reply">Resposta Rápida</SelectItem>
            <SelectItem value="list-picker">Lista</SelectItem>
            <SelectItem value="call-to-action">CTA</SelectItem>
            <SelectItem value="media">Mídia</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterLanguage} onValueChange={(v) => setFilterLanguage(v as FilterLanguage)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Idioma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Idiomas</SelectItem>
            <SelectItem value="pt_BR">Português</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="es">Español</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Idioma</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : filteredTemplates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">Nenhum template encontrado</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {templates?.length === 0 
                ? 'Crie um novo template ou sincronize os existentes do Twilio'
                : 'Nenhum template corresponde aos filtros selecionados'
              }
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={handleSync} disabled={syncMutation.isPending}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Sincronizar do Twilio
              </Button>
              <Button onClick={() => navigate('/whatsapp/templates/new')}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Template
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Idioma</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <div className="font-medium">{template.friendly_name}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-xs">
                        {template.body}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getTypeLabel(template.template_type)}</Badge>
                    </TableCell>
                    <TableCell>{getLanguageLabel(template.language)}</TableCell>
                    <TableCell>
                      <ApprovalStatusBadge status={template.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDistanceToNow(new Date(template.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/whatsapp/templates/${template.id}`)}>
                            <Eye className="w-4 h-4 mr-2" />
                            Ver Detalhes
                          </DropdownMenuItem>
                          {template.status !== 'approved' && (
                            <DropdownMenuItem onClick={() => navigate(`/whatsapp/templates/${template.id}/edit`)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                          )}
                          {(template.status === 'not_submitted' || template.status === 'draft') && (
                            <DropdownMenuItem onClick={() => openSubmitDialog(template.id)}>
                              <Send className="w-4 h-4 mr-2" />
                              Submeter para Aprovação
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleDelete(template.id, template.friendly_name)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Excluir Template"
        description={`Tem certeza que deseja excluir o template "${selectedTemplateName}"? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="destructive"
        onConfirm={confirmDelete}
        loading={deleteMutation.isPending}
      />

      {/* Submit for Approval Dialog */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Submeter para Aprovação</DialogTitle>
            <DialogDescription>
              Selecione a categoria do template antes de submeter para aprovação do WhatsApp.
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
    </div>
  );
}

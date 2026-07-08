import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast as sonnerToast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

import { Label } from '@/components/ui/label';
import { ApprovalStatusBadge } from '@/components/whatsapp/templates/ApprovalStatusBadge';
import {
  useTemplates,
  useDeleteTemplate,
  useSyncTemplates,
  useSyncMetaTemplates,
  useSubmitForApproval,
} from '@/hooks/useWhatsAppTemplates';
import { useOrganization } from '@/hooks/useOrganization';
import { useActiveWhatsAppProviders } from '@/hooks/useActiveWhatsAppProviders';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  ArrowsClockwise,
  DotsThree,
  Eye,
  PencilSimple,
  TrashSimple,
  PaperPlaneTilt,
  ChatCircle,
  SpinnerGap,
  CaretDown,
  Tag,
  Warning,
} from '@phosphor-icons/react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type FilterStatus = 'all' | 'approved' | 'pending' | 'rejected' | 'not_submitted' | 'draft';
type FilterType = 'all' | 'text' | 'quick-reply' | 'list-picker' | 'call-to-action' | 'media';
type FilterLanguage = 'all' | 'pt_BR' | 'pt-BR' | 'en' | 'es';
type FilterProvider = 'all' | 'twilio' | 'meta_cloud_api';
type FilterPurpose = 'all' | 'unclassified' | 'commercial' | 'customer_service' | 'vendor_personal' | 'other';

const PURPOSE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'commercial', label: 'Comercial' },
  { value: 'customer_service', label: 'Atendimento' },
  { value: 'vendor_personal', label: 'Pessoal/Vendedor' },
  { value: 'other', label: 'Outros' },
];

const PURPOSE_LABEL: Record<string, string> = Object.fromEntries(
  PURPOSE_OPTIONS.map((o) => [o.value, o.label]),
);

function isMetaTemplate(t: { provider?: string }) {
  return t.provider === 'meta_cloud_api';
}

function getPurposes(t: { allowed_purposes?: string[] | null }): string[] {
  return Array.isArray(t.allowed_purposes) ? t.allowed_purposes : [];
}

export default function WhatsAppTemplates() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const { data: templates, isLoading } = useTemplates(organization?.id);
  const deleteMutation = useDeleteTemplate();
  const syncMutation = useSyncTemplates();
  const syncMetaMutation = useSyncMetaTemplates();
  const submitMutation = useSubmitForApproval();
  const { hasTwilio, hasMeta } = useActiveWhatsAppProviders(organization?.id);

  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterLanguage, setFilterLanguage] = useState<FilterLanguage>('all');
  const [filterProvider, setFilterProvider] = useState<FilterProvider>('all');
  const [filterPurpose, setFilterPurpose] = useState<FilterPurpose>('all');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('');
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('UTILITY');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Purpose classification dialog
  const [purposeDialogOpen, setPurposeDialogOpen] = useState(false);
  const [purposeTargets, setPurposeTargets] = useState<string[]>([]);
  const [purposeForm, setPurposeForm] = useState<string[]>([]);
  const [savingPurposes, setSavingPurposes] = useState(false);

  const filteredTemplates = useMemo(() => {
    return templates?.filter(template => {
      if (filterStatus !== 'all' && template.status !== filterStatus) return false;
      if (filterType !== 'all' && template.template_type !== filterType) return false;
      if (filterLanguage !== 'all' && template.language !== filterLanguage) return false;
      if (filterProvider !== 'all') {
        const p = isMetaTemplate(template) ? 'meta_cloud_api' : 'twilio';
        if (p !== filterProvider) return false;
      }
      if (filterPurpose !== 'all') {
        const ap = getPurposes(template);
        if (filterPurpose === 'unclassified') {
          if (ap.length > 0) return false;
        } else if (!ap.includes(filterPurpose)) {
          return false;
        }
      }
      return true;
    }) || [];
  }, [templates, filterStatus, filterType, filterLanguage, filterProvider, filterPurpose]);

  const unclassifiedCount = useMemo(
    () => (templates ?? []).filter((t) => getPurposes(t).length === 0).length,
    [templates],
  );

  const allVisibleSelected =
    filteredTemplates.length > 0 &&
    filteredTemplates.every((t) => selectedIds.has(t.id));

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) filteredTemplates.forEach((t) => next.add(t.id));
      else filteredTemplates.forEach((t) => next.delete(t.id));
      return next;
    });
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const openPurposeDialogForOne = (id: string) => {
    const tpl = templates?.find((t) => t.id === id);
    setPurposeTargets([id]);
    setPurposeForm(getPurposes(tpl ?? { allowed_purposes: [] }));
    setPurposeDialogOpen(true);
  };

  const openPurposeDialogForSelection = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    // Se todos os selecionados têm o mesmo conjunto → prefill; senão vazio.
    const first = getPurposes(templates?.find((t) => t.id === ids[0]) ?? { allowed_purposes: [] })
      .slice()
      .sort()
      .join(',');
    const allSame = ids.every((id) => {
      const p = getPurposes(templates?.find((t) => t.id === id) ?? { allowed_purposes: [] })
        .slice()
        .sort()
        .join(',');
      return p === first;
    });
    setPurposeTargets(ids);
    setPurposeForm(allSame && first ? first.split(',') : []);
    setPurposeDialogOpen(true);
  };

  const togglePurposeInForm = (value: string, checked: boolean) => {
    setPurposeForm((prev) => {
      if (checked) return Array.from(new Set([...prev, value]));
      return prev.filter((p) => p !== value);
    });
  };

  const savePurposes = async () => {
    if (purposeTargets.length === 0 || !organization?.id) return;
    setSavingPurposes(true);
    const { error } = await supabase
      .from('whatsapp_templates')
      .update({ allowed_purposes: purposeForm })
      .in('id', purposeTargets)
      .eq('organization_id', organization.id);
    setSavingPurposes(false);
    if (error) {
      toast({ variant: 'destructive', description: `Falha ao classificar: ${error.message}` });
      return;
    }
    toast({
      description:
        purposeTargets.length === 1
          ? 'Classificação salva.'
          : `${purposeTargets.length} templates classificados.`,
    });
    setPurposeDialogOpen(false);
    setPurposeTargets([]);
    setPurposeForm([]);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['whatsapp-templates', organization.id] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp-template'] });
  };

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

  const notifyUnclassifiedAfterSync = () => {
    // Aguarda invalidação/refetch e checa quantos ficam sem purpose.
    setTimeout(async () => {
      if (!organization?.id) return;
      const { count } = await supabase
        .from('whatsapp_templates')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .or('allowed_purposes.is.null,allowed_purposes.eq.{}');
      if ((count ?? 0) > 0) {
        toast({
          description: `${count} template(s) precisam ser classificados antes de aparecer no composer.`,
        });
      }
    }, 800);
  };

  const handleSyncTwilio = () => {
    if (organization?.id) {
      syncMutation.mutate(organization.id, { onSuccess: notifyUnclassifiedAfterSync });
    }
  };
  const handleSyncMeta = () => {
    if (organization?.id) {
      syncMetaMutation.mutate(organization.id, { onSuccess: notifyUnclassifiedAfterSync });
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
      'authentication': 'Autenticação',
      'card': 'Card',
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

  const showBoth = hasTwilio && hasMeta;
  const onlyMeta = hasMeta && !hasTwilio;
  const syncPending = syncMutation.isPending || syncMetaMutation.isPending;

  const renderSyncButton = () => {
    if (showBoth) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={syncPending}>
              {syncPending ? (
                <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowsClockwise className="w-4 h-4 mr-2" />
              )}
              Sincronizar
              <CaretDown className="w-3 h-3 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleSyncTwilio}>Sincronizar Twilio</DropdownMenuItem>
            <DropdownMenuItem onClick={handleSyncMeta}>Sincronizar Meta</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    return (
      <Button
        variant="outline"
        onClick={onlyMeta ? handleSyncMeta : handleSyncTwilio}
        disabled={syncPending}
      >
        {syncPending ? (
          <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <ArrowsClockwise className="w-4 h-4 mr-2" />
        )}
        Sincronizar
      </Button>
    );
  };

  const goNewTwilio = () => navigate('/whatsapp/templates/new');
  const goNewMeta = () => navigate('/whatsapp/templates/new?provider=meta_cloud_api');

  const renderNewButton = () => {
    if (showBoth) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Novo Template
              <CaretDown className="w-3 h-3 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={goNewTwilio}>Twilio</DropdownMenuItem>
            <DropdownMenuItem onClick={goNewMeta}>Meta Cloud</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    return (
      <Button onClick={onlyMeta ? goNewMeta : goNewTwilio}>
        <Plus className="w-4 h-4 mr-2" />
        Novo Template
      </Button>
    );
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
          {renderSyncButton()}
          {renderNewButton()}
        </div>
      </div>

      {/* Unclassified banner */}
      {unclassifiedCount > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm flex items-start gap-3">
          <Warning size={18} weight="fill" className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              {unclassifiedCount} template(s) não classificados
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
              Templates sem "Usar em" não aparecem no composer de /messages ou /inbox.
              Classifique abaixo para liberar o envio.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFilterPurpose('unclassified')}
          >
            Ver não classificados
          </Button>
        </div>
      )}

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

        <Select value={filterProvider} onValueChange={(v) => setFilterProvider(v as FilterProvider)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Providers</SelectItem>
            <SelectItem value="twilio">Twilio</SelectItem>
            <SelectItem value="meta_cloud_api">Meta Cloud</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterPurpose} onValueChange={(v) => setFilterPurpose(v as FilterPurpose)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Uso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Usos</SelectItem>
            <SelectItem value="unclassified">Não classificados</SelectItem>
            {PURPOSE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-4 py-2 text-sm">
          <span>{selectedIds.size} selecionado(s)</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              Limpar
            </Button>
            <Button size="sm" onClick={openPurposeDialogForSelection}>
              <Tag className="w-4 h-4 mr-2" />
              Classificar uso
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Usar em</TableHead>
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
                    <TableCell></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
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
            <ChatCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">Nenhum template encontrado</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {templates?.length === 0
                ? 'Crie um novo template ou sincronize os existentes'
                : 'Nenhum template corresponde aos filtros selecionados'
              }
            </p>
            <div className="flex gap-2 justify-center">
              {renderSyncButton()}
              {renderNewButton()}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(v) => toggleAllVisible(!!v)}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Usar em</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Idioma</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template) => {
                  const isMeta = isMetaTemplate(template);
                  const purposes = getPurposes(template);
                  const unclassified = purposes.length === 0;
                  return (
                    <TableRow key={template.id} data-state={selectedIds.has(template.id) ? 'selected' : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(template.id)}
                          onCheckedChange={(v) => toggleOne(template.id, !!v)}
                          aria-label={`Selecionar ${template.friendly_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{template.friendly_name}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-xs">
                          {template.body}
                        </div>
                      </TableCell>
                      <TableCell>
                        {isMeta ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/15">
                            Meta Cloud
                          </Badge>
                        ) : (
                          <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30 hover:bg-sky-500/15">
                            Twilio
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {unclassified ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => openPurposeDialogForOne(template.id)}
                                  className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-500/20"
                                >
                                  <Warning size={11} weight="fill" />
                                  Não classificado
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                Este template não aparecerá no envio até ser classificado.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {purposes.map((p) => (
                              <Badge key={p} variant="outline" className="text-[10px]">
                                {PURPOSE_LABEL[p] ?? p}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getTypeLabel(template.template_type)}</Badge>
                      </TableCell>
                      <TableCell>{getLanguageLabel(template.language)}</TableCell>
                      <TableCell>
                        {isMeta && template.status === 'rejected' ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-block cursor-help">
                                  <ApprovalStatusBadge status={template.status} />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                {template.rejection_reason || 'Motivo não informado pela Meta'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <ApprovalStatusBadge status={template.status} />
                        )}
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
                              <DotsThree className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/whatsapp/templates/${template.id}`)}>
                              <Eye className="w-4 h-4 mr-2" />
                              Ver Detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPurposeDialogForOne(template.id)}>
                              <Tag className="w-4 h-4 mr-2" />
                              Classificar uso
                            </DropdownMenuItem>
                            {template.status !== 'approved' && (
                              <DropdownMenuItem onClick={() => navigate(`/whatsapp/templates/${template.id}/edit`)}>
                                <PencilSimple className="w-4 h-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                            )}
                            {!isMeta && (template.status === 'not_submitted' || template.status === 'draft' || template.status === 'rejected') && (
                              <DropdownMenuItem onClick={() => openSubmitDialog(template.id)}>
                                <PaperPlaneTilt className="w-4 h-4 mr-2" />
                                Submeter para Aprovação
                              </DropdownMenuItem>
                            )}
                            {!isMeta && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleDelete(template.id, template.friendly_name)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <TrashSimple className="w-4 h-4 mr-2" />
                                  Excluir
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
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

      {/* Purpose classification dialog */}
      <Dialog open={purposeDialogOpen} onOpenChange={setPurposeDialogOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Classificar uso</DialogTitle>
            <DialogDescription>
              Escolha em quais contextos {purposeTargets.length > 1 ? `estes ${purposeTargets.length} templates` : 'este template'} pode ser enviado.
              O composer só mostra templates cujo uso corresponde ao endpoint da conversa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            {PURPOSE_OPTIONS.map((opt) => {
              const checked = purposeForm.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-3 rounded border px-3 py-2 cursor-pointer hover:bg-muted/40"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => togglePurposeInForm(opt.value, !!v)}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              );
            })}
            {purposeForm.length === 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1 pt-1">
                <Warning size={12} weight="fill" />
                Sem seleção o template continuará oculto no composer.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPurposeDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={savePurposes} disabled={savingPurposes}>
              {savingPurposes ? (
                <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Tag className="w-4 h-4 mr-2" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <PaperPlaneTilt className="w-4 h-4 mr-2" />
              )}
              Submeter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

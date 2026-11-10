import { useEffect, useState } from 'react';
import {
  CaretDown, CaretUp, FloppyDisk, Info, PencilSimple, Plus, Robot, SpinnerGap, TextAlignLeft, TrashSimple,
} from '@phosphor-icons/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from '@/hooks/use-toast';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import {
  lossErrorMessage, reorderLossItems, type LossDetail, type LossDetailMode, type LossReason, type LossSettings,
} from '@/lib/lossReasons';
import { useLossCatalog } from './useLossCatalog';
import { LossReasonDialog } from './LossReasonDialog';
import { LossDetailDialog } from './LossDetailDialog';
import { LossStageRulesCard } from './LossStageRulesCard';

type DeleteTarget = { kind: 'reason'; item: LossReason } | { kind: 'detail'; item: LossDetail };

export function LossReasonsSettings() {
  useUiLocale();
  const { organization } = useOrganization();
  const { permissions } = usePermissions();
  const canManage = !!permissions.canManageSettings;
  const orgId = organization?.id;
  const { reasons, details, settings, usage, stages, rules, issues, loading, reload } = useLossCatalog(orgId, canManage);

  const [draft, setDraft] = useState<LossSettings>(settings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [reasonDialog, setReasonDialog] = useState<{ open: boolean; reason: LossReason | null }>({ open: false, reason: null });
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; reason: LossReason | null; detail: LossDetail | null }>({ open: false, reason: null, detail: null });
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { setDraft(settings); }, [settings]);

  if (!orgId) return null;
  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><SpinnerGap className="animate-spin" /> {uiText('Carregando…')}</div>;
  }

  const reasonUsed = (r: LossReason) => !!usage.reasons[r.id] || details.some((d) => d.reason_id === r.id && !!usage.details[d.id]);
  const detailInRule = (d: LossDetail) => rules.some((r) => r.detail_id === d.id);
  const hasActiveReason = reasons.some((r) => r.is_active);
  const settingsDirty = draft.reason_required !== settings.reason_required || draft.detail_mode !== settings.detail_mode;

  const saveSettings = async () => {
    setSavingSettings(true);
    const { error } = await supabase.from('opportunity_loss_settings')
      .upsert({ organization_id: orgId, ...draft }, { onConflict: 'organization_id' });
    setSavingSettings(false);
    if (error) {
      toast({ title: uiText('Não foi possível salvar as regras gerais'), description: lossErrorMessage(error) ?? undefined, variant: 'destructive' });
      return;
    }
    toast({ title: uiText('Regras gerais salvas') });
    await reload();
  };

  const move = async (table: 'opportunity_loss_reasons' | 'opportunity_loss_reason_details', items: { id: string; order_index: number }[], id: string, direction: -1 | 1) => {
    const updates = reorderLossItems(items, id, direction);
    if (updates.length === 0) return;
    const results = await Promise.all(updates.map((u) => supabase.from(table).update({ order_index: u.order_index }).eq('id', u.id)));
    const failed = results.find((r) => r.error);
    if (failed?.error) toast({ title: uiText('Não foi possível reordenar'), description: lossErrorMessage(failed.error) ?? undefined, variant: 'destructive' });
    await reload();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const table = deleteTarget.kind === 'reason' ? 'opportunity_loss_reasons' : 'opportunity_loss_reason_details';
    const { error } = await supabase.from(table).delete().eq('id', deleteTarget.item.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (error) {
      toast({ title: uiText('Não foi possível apagar'), description: lossErrorMessage(error) ?? undefined, variant: 'destructive' });
      return;
    }
    await reload();
  };

  return (
    <div className="space-y-6">
      {!canManage && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>{uiText('Só o administrador da organização altera os motivos de perda. Você está vendo em modo leitura.')}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>{uiText('Motivos de perda')}</CardTitle>
            <CardDescription>
              {uiText('Uma lista por organização, válida para todo o funil. Relatórios, automações e integrações usam o código; o nome pode mudar a qualquer momento.')}
            </CardDescription>
          </div>
          {canManage && (
            <Button onClick={() => setReasonDialog({ open: true, reason: null })}><Plus className="mr-2" weight="bold" />{uiText('Novo motivo')}</Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {reasons.length === 0 && (
            <p className="text-sm text-muted-foreground">{uiText('Nenhum motivo cadastrado. Enquanto não houver, as perdas continuam sendo marcadas sem motivo.')}</p>
          )}
          {reasons.map((reason, reasonIndex) => {
            const reasonDetails = details.filter((d) => d.reason_id === reason.id).sort((a, b) => a.order_index - b.order_index);
            const used = reasonUsed(reason);
            return (
              <div key={reason.id} className={`rounded-lg border ${reason.is_active ? '' : 'opacity-60'}`}>
                <div className="flex items-center gap-2 border-b p-3">
                  <span className="font-data text-sm">{reason.code}</span>
                  <span className="font-medium">{reason.name}</span>
                  {!reason.is_active && <Badge variant="neutral" size="sm">{uiText('Inativo')}</Badge>}
                  {used && <Badge variant="outline" size="sm">{uiText('Em uso')}</Badge>}
                  {canManage && (
                    <div className="ml-auto flex items-center gap-1">
                      <Button variant="ghost" size="icon" aria-label={uiText('Subir')} disabled={reasonIndex === 0}
                        onClick={() => void move('opportunity_loss_reasons', reasons, reason.id, -1)}><CaretUp size={16} /></Button>
                      <Button variant="ghost" size="icon" aria-label={uiText('Descer')} disabled={reasonIndex === reasons.length - 1}
                        onClick={() => void move('opportunity_loss_reasons', reasons, reason.id, 1)}><CaretDown size={16} /></Button>
                      <Button variant="ghost" size="icon" aria-label={uiText('Editar')}
                        onClick={() => setReasonDialog({ open: true, reason })}><PencilSimple size={16} /></Button>
                      <Button variant="ghost" size="icon" aria-label={uiText('Apagar')} disabled={used}
                        title={used ? uiText('Motivo já usado não pode ser apagado. Inative-o.') : undefined}
                        onClick={() => setDeleteTarget({ kind: 'reason', item: reason })}><TrashSimple size={16} /></Button>
                    </div>
                  )}
                </div>
                <div className="divide-y">
                  {reasonDetails.map((detail, detailIndex) => {
                    const detailUsed = !!usage.details[detail.id];
                    return (
                      <div key={detail.id} className={`flex items-start gap-2 py-2 pl-6 pr-3 ${detail.is_active ? '' : 'opacity-60'}`}>
                        <span className="font-data w-14 shrink-0 pt-0.5 text-sm">{detail.code}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-sm">
                            <span>{detail.name}</span>
                            {!detail.is_active && <Badge variant="neutral" size="sm">{uiText('Inativo')}</Badge>}
                            {detail.automation_only && (
                              <Badge variant="info" size="sm" icon={<Robot size={12} />}>{uiText('Só automação')}</Badge>
                            )}
                            {detail.requires_description && (
                              <Badge variant="outline" size="sm" icon={<TextAlignLeft size={12} />}>{uiText('Exige descrição')}</Badge>
                            )}
                            {detailUsed && <Badge variant="outline" size="sm">{uiText('Em uso')}</Badge>}
                          </div>
                          {detail.help_text && <p className="truncate text-xs text-muted-foreground">{detail.help_text}</p>}
                        </div>
                        {canManage && (
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" aria-label={uiText('Subir')} disabled={detailIndex === 0}
                              onClick={() => void move('opportunity_loss_reason_details', reasonDetails, detail.id, -1)}><CaretUp size={16} /></Button>
                            <Button variant="ghost" size="icon" aria-label={uiText('Descer')} disabled={detailIndex === reasonDetails.length - 1}
                              onClick={() => void move('opportunity_loss_reason_details', reasonDetails, detail.id, 1)}><CaretDown size={16} /></Button>
                            <Button variant="ghost" size="icon" aria-label={uiText('Editar')}
                              onClick={() => setDetailDialog({ open: true, reason, detail })}><PencilSimple size={16} /></Button>
                            <Button variant="ghost" size="icon" aria-label={uiText('Apagar')} disabled={detailUsed || detailInRule(detail)}
                              title={detailUsed ? uiText('Detalhe já usado não pode ser apagado. Inative-o.')
                                : detailInRule(detail) ? uiText('Este detalhe está numa regra por etapa. Tire a regra antes de apagar.') : undefined}
                              onClick={() => setDeleteTarget({ kind: 'detail', item: detail })}><TrashSimple size={16} /></Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {canManage && (
                    <div className="py-2 pl-6 pr-3">
                      <Button variant="ghost" size="sm" onClick={() => setDetailDialog({ open: true, reason, detail: null })}>
                        <Plus className="mr-1.5" size={14} />{uiText('Adicionar detalhe')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{uiText('Regras gerais')}</CardTitle>
          <CardDescription>{uiText('Valem ao marcar uma oportunidade como Perdida.')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <Label>{uiText('Motivo obrigatório para marcar como Perdida')}</Label>
              <p className="text-xs text-muted-foreground">
                {hasActiveReason
                  ? uiText('Só é cobrado enquanto houver pelo menos um motivo ativo cadastrado.')
                  : uiText('Ainda não há motivo ativo: as perdas continuam sendo marcadas sem motivo até você cadastrar um.')}
              </p>
            </div>
            <Switch checked={draft.reason_required} disabled={!canManage}
              onCheckedChange={(v) => setDraft({ ...draft, reason_required: v })} />
          </div>
          <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label>{uiText('Uso de detalhe')}</Label>
              <p className="text-xs text-muted-foreground">
                {uiText('Obrigatório só é cobrado quando o motivo tem algum detalhe que a pessoa pode escolher. A automação sempre pode gravar o detalhe.')}
              </p>
            </div>
            <Select value={draft.detail_mode} disabled={!canManage} onValueChange={(v) => setDraft({ ...draft, detail_mode: v as LossDetailMode })}>
              <SelectTrigger className="sm:w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">{uiText('Desligado')}</SelectItem>
                <SelectItem value="optional">{uiText('Opcional')}</SelectItem>
                <SelectItem value="required">{uiText('Obrigatório')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {canManage && (
            <div className="flex justify-end">
              <Button onClick={saveSettings} disabled={!settingsDirty || savingSettings}>
                {savingSettings ? <SpinnerGap className="mr-2 animate-spin" /> : <FloppyDisk className="mr-2" />}{uiText('Salvar')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <LossStageRulesCard organizationId={orgId} canManage={canManage} stages={stages} rules={rules} issues={issues}
        reasons={reasons} details={details} onChanged={reload} />

      <LossReasonDialog open={reasonDialog.open} onOpenChange={(open) => setReasonDialog((s) => ({ ...s, open }))}
        organizationId={orgId} reason={reasonDialog.reason} reasons={reasons}
        codeLocked={!!reasonDialog.reason && reasonUsed(reasonDialog.reason)} onSaved={reload} />

      {detailDialog.reason && (
        <LossDetailDialog open={detailDialog.open} onOpenChange={(open) => setDetailDialog((s) => ({ ...s, open }))}
          organizationId={orgId} reason={detailDialog.reason} detail={detailDialog.detail} allDetails={details}
          codeLocked={!!detailDialog.detail && !!usage.details[detailDialog.detail.id]} onSaved={reload} />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={deleteTarget?.kind === 'reason' ? uiText('Apagar motivo') : uiText('Apagar detalhe')}
        description={deleteTarget?.kind === 'reason'
          ? uiText('O motivo {0} e os detalhes dele serão apagados. Isso só é possível porque nunca foram usados.', { 0: deleteTarget.item.code })
          : uiText('O detalhe {0} será apagado. Isso só é possível porque nunca foi usado.', { 0: deleteTarget?.item.code ?? '' })}
        confirmText={uiText('Apagar')}
        variant="destructive"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

export default LossReasonsSettings;

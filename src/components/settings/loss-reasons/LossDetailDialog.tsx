import { useEffect, useState } from 'react';
import { SpinnerGap } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { lossErrorMessage, nextOrderIndex, type LossDetail, type LossReason } from '@/lib/lossReasons';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  reason: LossReason;
  detail: LossDetail | null;
  allDetails: LossDetail[];
  onSaved: () => void | Promise<void>;
}

export function LossDetailDialog({ open, onOpenChange, organizationId, reason, detail, allDetails, onSaved }: Props) {
  useUiLocale();
  const [name, setName] = useState('');
  const [helpText, setHelpText] = useState('');
  const [active, setActive] = useState(true);
  const [requiresDescription, setRequiresDescription] = useState(false);
  const [automationOnly, setAutomationOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(detail?.name ?? '');
    setHelpText(detail?.help_text ?? '');
    setActive(detail?.is_active ?? true);
    setRequiresDescription(detail?.requires_description ?? false);
    setAutomationOnly(detail?.automation_only ?? false);
  }, [open, detail]);

  const canSave = !!name.trim() && !saving;

  const save = async () => {
    setSaving(true);
    const fields = {
      name: name.trim(),
      help_text: helpText.trim() || null,
      is_active: active,
      requires_description: requiresDescription,
      automation_only: automationOnly,
    };
    const siblings = allDetails.filter((d) => d.reason_id === reason.id);
    // o código é gerado pelo banco (código do motivo + número em sequência) e nunca muda
    const { error } = detail
      ? await supabase.from('opportunity_loss_reason_details').update(fields).eq('id', detail.id)
      : await supabase.from('opportunity_loss_reason_details').insert({
          ...fields, organization_id: organizationId, reason_id: reason.id,
          order_index: nextOrderIndex(siblings),
        });
    setSaving(false);
    if (error) {
      toast({ title: uiText('Não foi possível salvar o detalhe'), description: lossErrorMessage(error) ?? undefined, variant: 'destructive' });
      return;
    }
    await onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{detail ? uiText('Editar detalhe') : uiText('Novo detalhe')}</DialogTitle>
          <DialogDescription>{detail ? uiText('Motivo: {0} · código {1} (gerado automaticamente).', { 0: `${reason.code} · ${reason.name}`, 1: detail.code }) : uiText('Motivo: {0}. O código é gerado automaticamente.', { 0: `${reason.code} · ${reason.name}` })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="loss-detail-name">{uiText('Nome')}</Label>
            <Input id="loss-detail-name" value={name} maxLength={160} onChange={(e) => setName(e.target.value)}
              placeholder={uiText('Nunca contribuiu antes do parto')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="loss-detail-help">{uiText('Texto de ajuda (opcional)')}</Label>
            <Input id="loss-detail-help" value={helpText} maxLength={200}
              onChange={(e) => setHelpText(e.target.value.replace(/[\r\n]+/g, ' '))}
              placeholder={uiText('Uma linha dizendo quando usar')} />
          </div>
          <div className="space-y-2">
            <Label>{uiText('Quem pode marcar')}</Label>
            <Select value={automationOnly ? 'automation' : 'all'} onValueChange={(v) => setAutomationOnly(v === 'automation')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{uiText('Pessoas e automação')}</SelectItem>
                <SelectItem value="automation">{uiText('Só automação')}</SelectItem>
              </SelectContent>
            </Select>
            {automationOnly && (
              <p className="text-xs text-muted-foreground">{uiText('Não aparece para as pessoas escolherem, mas aparece no histórico e pode ser usado nas regras por etapa.')}</p>
            )}
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>{uiText('Exige descrição')}</Label>
              <p className="text-xs text-muted-foreground">{uiText('Quem marca este detalhe precisa escrever o que aconteceu.')}</p>
            </div>
            <Switch checked={requiresDescription} onCheckedChange={setRequiresDescription} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>{uiText('Ativo')}</Label>
              <p className="text-xs text-muted-foreground">{uiText('Inativo some da lista de escolha, mas continua no histórico.')}</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{uiText('Cancelar')}</Button>
          <Button onClick={save} disabled={!canSave}>{saving && <SpinnerGap className="mr-2 animate-spin" />}{uiText('Salvar')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

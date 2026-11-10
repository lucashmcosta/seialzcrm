import { useEffect, useState } from 'react';
import { SpinnerGap } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { lossErrorMessage, nextOrderIndex, type LossReason } from '@/lib/lossReasons';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  reason: LossReason | null;
  reasons: LossReason[];
  onSaved: () => void | Promise<void>;
}

export function LossReasonDialog({ open, onOpenChange, organizationId, reason, reasons, onSaved }: Props) {
  useUiLocale();
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(reason?.name ?? '');
    setActive(reason?.is_active ?? true);
  }, [open, reason]);

  const canSave = !!name.trim() && !saving;

  const save = async () => {
    setSaving(true);
    // o código é gerado pelo banco (letras em sequência) e nunca muda
    const payload = { name: name.trim(), is_active: active };
    const { error } = reason
      ? await supabase.from('opportunity_loss_reasons').update(payload).eq('id', reason.id)
      : await supabase.from('opportunity_loss_reasons')
          .insert({ ...payload, organization_id: organizationId, order_index: nextOrderIndex(reasons) });
    setSaving(false);
    if (error) {
      toast({ title: uiText('Não foi possível salvar o motivo'), description: lossErrorMessage(error) ?? undefined, variant: 'destructive' });
      return;
    }
    await onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{reason ? uiText('Editar motivo') : uiText('Novo motivo')}</DialogTitle>
          <DialogDescription>{reason ? uiText('Código {0} (gerado automaticamente).', { 0: reason.code }) : uiText('O motivo agrupa os detalhes. O código é gerado automaticamente.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="loss-reason-name">{uiText('Nome')}</Label>
            <Input id="loss-reason-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={uiText('Sem direito')} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>{uiText('Ativo')}</Label>
              <p className="text-xs text-muted-foreground">{uiText('Inativo some da lista de escolha, junto com os detalhes, mas continua no histórico.')}</p>
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

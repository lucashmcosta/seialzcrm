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
import { isValidLossCode, lossCodeTaken, lossErrorMessage, nextOrderIndex, normalizeLossCode, type LossReason } from '@/lib/lossReasons';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  reason: LossReason | null;
  reasons: LossReason[];
  codeLocked: boolean;
  onSaved: () => void | Promise<void>;
}

export function LossReasonDialog({ open, onOpenChange, organizationId, reason, reasons, codeLocked, onSaved }: Props) {
  useUiLocale();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(reason?.code ?? '');
    setName(reason?.name ?? '');
    setActive(reason?.is_active ?? true);
  }, [open, reason]);

  const codeError = !code.trim() ? null
    : !isValidLossCode(code) ? uiText('Use até 20 letras, números, ponto, hífen ou sublinhado, sem espaço.')
    : lossCodeTaken(code, reasons, reason?.id) ? uiText('Este código já existe nesta organização (inclusive entre os inativos).')
    : null;
  const canSave = !!code.trim() && !!name.trim() && !codeError && !saving;

  const save = async () => {
    setSaving(true);
    const payload = { code: normalizeLossCode(code), name: name.trim(), is_active: active };
    const { error } = reason
      ? await supabase.from('opportunity_loss_reasons')
          .update(codeLocked ? { name: payload.name, is_active: payload.is_active } : payload)
          .eq('id', reason.id)
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
          <DialogDescription>{uiText('O motivo agrupa os detalhes. O código serve de prefixo sugerido para os detalhes dele.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <div className="space-y-2">
              <Label htmlFor="loss-reason-code">{uiText('Código')}</Label>
              <Input id="loss-reason-code" value={code} maxLength={20} disabled={codeLocked} className="font-data uppercase"
                onChange={(e) => setCode(e.target.value)} placeholder="A" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loss-reason-name">{uiText('Nome')}</Label>
              <Input id="loss-reason-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={uiText('Sem direito')} />
            </div>
          </div>
          {codeLocked && <p className="text-xs text-muted-foreground">{uiText('O código já foi usado em alguma oportunidade e não pode mudar.')}</p>}
          {codeError && <p className="text-xs text-destructive">{codeError}</p>}
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

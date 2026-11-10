import { useEffect, useState } from 'react';
import { SpinnerGap } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from '@/hooks/use-toast';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { lossErrorMessage, rpcNullable, validateLossChoice } from '@/lib/lossReasons';
import { LossChoiceFields } from './LossChoiceFields';
import { EMPTY_LOSS_CHOICE, useLossOptions, type LossChoice } from './useLossOptions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Uma oportunidade, ou várias (ações em lote: mesma escolha para todas, tudo ou nada). */
  opportunityIds: string[];
  /** Título da oportunidade, quando é uma só. */
  opportunityTitle?: string | null;
  initialCloseDate?: string | null;
  /** De onde veio a perda (gravado em opportunity_losses.source). */
  source: string;
  onSuccess: () => void | Promise<void>;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Marcar como Perdida: data + motivo, detalhe e descrição conforme as regras da organização. */
export function LossDialog({ open, onOpenChange, opportunityIds, opportunityTitle, initialCloseDate, source, onSuccess }: Props) {
  useUiLocale();
  const { organization } = useOrganization();
  const { options, loading } = useLossOptions(organization?.id, open);
  const [date, setDate] = useState(today());
  const [choice, setChoice] = useState<LossChoice>(EMPTY_LOSS_CHOICE);
  const [saving, setSaving] = useState(false);
  const batch = opportunityIds.length > 1;

  useEffect(() => {
    if (!open) return;
    setDate(initialCloseDate || today());
    setChoice(EMPTY_LOSS_CHOICE);
  }, [open, initialCloseDate]);

  const problem = loading ? null : validateLossChoice(options, choice.reasonId, choice.detailId, choice.description);

  const confirm = async () => {
    if (!organization?.id || !date || problem) return;
    setSaving(true);
    const common = {
      _organization_id: organization.id,
      _reason_id: rpcNullable(choice.reasonId),
      _detail_id: rpcNullable(choice.detailId),
      _description: rpcNullable(choice.description.trim() || null),
      _close_date: date,
      _source: source,
    };
    const { error } = batch
      ? await supabase.rpc('mark_opportunities_lost_batch_v1', { ...common, _opportunity_ids: opportunityIds })
      : await supabase.rpc('mark_opportunity_lost_v1', { ...common, _opportunity_id: opportunityIds[0] });
    setSaving(false);
    if (error) {
      toast({
        title: uiText('Não foi possível marcar como perdida'),
        description: lossErrorMessage(error) ?? uiText('Não foi possível concluir a operação. Tente novamente.'),
        variant: 'destructive',
      });
      return;
    }
    toast({ title: batch ? uiText('{0} oportunidades marcadas como perdidas', { 0: opportunityIds.length }) : uiText('Oportunidade marcada como perdida') });
    await onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{batch ? uiText('Marcar selecionadas como perdidas') : uiText('Marcar como perdida')}</DialogTitle>
          <DialogDescription>
            {batch
              ? uiText('A mesma escolha vale para as {0} oportunidades selecionadas.', { 0: opportunityIds.length })
              : opportunityTitle || uiText('Informe o que aconteceu com esta oportunidade.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="loss-close-date">{uiText('Data de fechamento')}</Label>
            <Input id="loss-close-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {loading
            ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><SpinnerGap className="animate-spin" /> {uiText('Carregando…')}</div>
            : <LossChoiceFields options={options} value={choice} onChange={setChoice} disabled={saving} />}
          {problem && (choice.reasonId || choice.detailId || choice.description) && <p className="text-xs text-destructive">{problem}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{uiText('Cancelar')}</Button>
          <Button variant="destructive" onClick={confirm} disabled={saving || loading || !date || !!problem}>
            {saving && <SpinnerGap className="mr-2 animate-spin" />}{uiText('Marcar como perdida')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

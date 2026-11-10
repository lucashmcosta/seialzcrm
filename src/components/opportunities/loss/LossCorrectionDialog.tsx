import { useEffect, useState } from 'react';
import { SpinnerGap } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from '@/hooks/use-toast';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { lossErrorMessage, rpcNullable, validateLossChoice } from '@/lib/lossReasons';
import { LossChoiceFields } from './LossChoiceFields';
import { useLossOptions, type LossChoice } from './useLossOptions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  current: LossChoice;
  onSuccess: () => void | Promise<void>;
}

/** Corrigir o motivo da perda em aberto. Registra quem alterou, quando e o valor anterior. */
export function LossCorrectionDialog({ open, onOpenChange, opportunityId, current, onSuccess }: Props) {
  useUiLocale();
  const { organization } = useOrganization();
  const { options, loading } = useLossOptions(organization?.id, open);
  const [choice, setChoice] = useState<LossChoice>(current);
  const [saving, setSaving] = useState(false);

  // depende do conteúdo, não da identidade: o pai pode recriar o objeto a cada render
  const currentKey = JSON.stringify(current);
  useEffect(() => { if (open) setChoice(JSON.parse(currentKey) as LossChoice); }, [open, currentKey]);

  // valor atual com motivo/detalhe que saiu da lista (inativo, só automação) não é pré-selecionado
  useEffect(() => {
    if (loading) return;
    setChoice((c) => {
      const reason = options.reasons.find((r) => r.id === c.reasonId);
      if (!reason) return { ...c, reasonId: null, detailId: null };
      if (c.detailId && !reason.details.some((d) => d.id === c.detailId)) return { ...c, detailId: null };
      return c;
    });
  }, [loading, options]);

  const problem = loading ? null : validateLossChoice(options, choice.reasonId, choice.detailId, choice.description);

  const save = async () => {
    if (!organization?.id || problem) return;
    setSaving(true);
    const { error } = await supabase.rpc('correct_opportunity_loss_v1', {
      _organization_id: organization.id,
      _opportunity_id: opportunityId,
      _reason_id: rpcNullable(choice.reasonId),
      _detail_id: rpcNullable(choice.detailId),
      _description: rpcNullable(choice.description.trim() || null),
    });
    setSaving(false);
    if (error) {
      toast({
        title: uiText('Não foi possível corrigir o motivo'),
        description: lossErrorMessage(error) ?? uiText('Não foi possível concluir a operação. Tente novamente.'),
        variant: 'destructive',
      });
      return;
    }
    toast({ title: uiText('Motivo da perda corrigido') });
    await onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{uiText('Corrigir motivo da perda')}</DialogTitle>
          <DialogDescription>{uiText('A alteração fica registrada com o valor anterior, quem alterou e quando.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {loading
            ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><SpinnerGap className="animate-spin" /> {uiText('Carregando…')}</div>
            : options.reasons.length === 0
              ? <p className="text-sm text-muted-foreground">{uiText('Não há motivo ativo cadastrado. Cadastre em Configurações › Motivos de perda.')}</p>
              : <LossChoiceFields options={options} value={choice} onChange={setChoice} disabled={saving} />}
          {problem && <p className="text-xs text-destructive">{problem}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{uiText('Cancelar')}</Button>
          <Button onClick={save} disabled={saving || loading || !!problem || options.reasons.length === 0}>
            {saving && <SpinnerGap className="mr-2 animate-spin" />}{uiText('Salvar correção')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

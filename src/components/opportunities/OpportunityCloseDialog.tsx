import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, SpinnerGap, WarningCircle, XCircle } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useOrganization } from '@/hooks/useOrganization';
import { useRegistryLookup } from '@/hooks/useRegistryLookup';
import { supabase } from '@/integrations/supabase/client';
import { evaluateOpportunityClose, transitionOpportunityStage, type OpportunityCloseEvaluation } from '@/lib/opportunityClose';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  contactId: string | null;
  targetStageId: string;
  source: string;
  initialCloseDate?: string | null;
  onSuccess: () => void | Promise<void>;
}

export function OpportunityCloseDialog(props: Props) {
  const { organization } = useOrganization();
  const { lookup } = useRegistryLookup();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [evaluation, setEvaluation] = useState<OpportunityCloseEvaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingCpf, setCheckingCpf] = useState(false);
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState('');
  const checkedCpf = useRef(false);

  const refresh = useCallback(async () => {
    if (!organization?.id) return;
    setEvaluation(await evaluateOpportunityClose(organization.id, props.opportunityId));
  }, [organization?.id, props.opportunityId]);

  useEffect(() => {
    if (!props.open) return;
    setDate(props.initialCloseDate || new Date().toISOString().slice(0, 10));
    setOverride(false);
    setReason('');
    checkedCpf.current = false;
    void refresh();
  }, [props.open, props.initialCloseDate, refresh]);

  useEffect(() => {
    if (!props.open || !evaluation || checkedCpf.current || !props.contactId) return;
    if (!evaluation.missing_codes.includes('cpf_api_verified')) return;
    checkedCpf.current = true;
    setCheckingCpf(true);
    void supabase.from('contacts').select('cpf').eq('id', props.contactId).maybeSingle()
      .then(async ({ data }) => {
        if (data?.cpf) {
          try { await lookup('cpf', data.cpf, { contactId: props.contactId! }); } catch { /* checklist explains the result */ }
          await refresh();
        }
      })
      .finally(() => setCheckingCpf(false));
  }, [props.open, evaluation, props.contactId, lookup, refresh]);

  const confirm = async () => {
    if (!organization?.id || !date) return;
    setLoading(true);
    try {
      const result = await transitionOpportunityStage({
        organizationId: organization.id,
        opportunityId: props.opportunityId,
        targetStageId: props.targetStageId,
        closeDate: date,
        override,
        overrideReason: reason,
        source: props.source,
      });
      if (!result.ok) { setEvaluation(result); return; }
      await props.onSuccess();
      props.onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const blocked = evaluation?.mode === 'enforce' && !evaluation.can_close;
  const canOverride = blocked && evaluation?.override_allowed;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Marcar oportunidade como ganha</DialogTitle>
          <DialogDescription>Confira os dados necessários antes de concluir.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-2"><Label htmlFor="opportunity-close-date">Data de fechamento</Label><Input id="opportunity-close-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          {!evaluation ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><SpinnerGap className="animate-spin" /> Verificando regras…</div> : (
            <div className="rounded-lg border divide-y">
              {evaluation.items.length === 0 && <p className="p-3 text-sm text-muted-foreground">Esta organização não possui requisitos obrigatórios.</p>}
              {evaluation.items.map((item) => (
                <div key={item.code} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span className="flex items-center gap-2">
                    {item.status === 'passed' ? <CheckCircle className="text-emerald-600" weight="fill" /> : item.status === 'warning' ? <WarningCircle className="text-amber-600" weight="fill" /> : <XCircle className="text-destructive" weight="fill" />}
                    {item.label}{item.code === 'cpf_api_verified' && checkingCpf ? ' — consultando…' : ''}
                  </span>
                  {item.status === 'missing' && item.action === 'edit_contact' && props.contactId && <Button asChild variant="link" size="sm"><Link to={`/contacts/${props.contactId}/edit`}>Corrigir contato</Link></Button>}
                </div>
              ))}
            </div>
          )}
          {evaluation?.fallback_used && <Alert><WarningCircle /><AlertTitle>Contingência do provedor</AlertTitle><AlertDescription>O CPF é matematicamente válido e houve indisponibilidade real registrada há menos de 30 minutos. O ganho será auditado.</AlertDescription></Alert>}
          {evaluation?.mode === 'monitor' && evaluation.missing_count > 0 && <Alert><WarningCircle /><AlertTitle>Modo monitor</AlertTitle><AlertDescription>Existem pendências, mas elas ainda não bloqueiam esta operação.</AlertDescription></Alert>}
          {canOverride && <div className="rounded-lg border border-amber-300 p-3 space-y-3"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Forçar ganho como administrador</label>{override && <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Informe o motivo (mínimo de 5 caracteres)" />}</div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={loading}>Cancelar</Button><Button onClick={confirm} disabled={loading || checkingCpf || !evaluation || (blocked && !(override && reason.trim().length >= 5))}>{loading && <SpinnerGap className="mr-2 animate-spin" />}Confirmar ganho</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

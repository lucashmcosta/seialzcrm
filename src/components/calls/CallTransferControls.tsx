import { useEffect, useState } from 'react';
import { ArrowsLeftRight, ArrowUUpLeft, Pause, PhoneCall, PhoneSlash, SpinnerGap, UserSwitch, Users } from '@phosphor-icons/react';
import { useOutboundCall } from '@/contexts/OutboundCallContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CallTransferTarget } from '@/contexts/outbound-call/types';

// The transfer flow is presented as a "hold" (espera) experience: put the
// customer on hold, talk privately with a colleague, then decide to hand the
// customer over or come back. It rides the same backend state machine.
const STATE_LABELS: Record<string, string> = {
  parking_customer: 'Colocando cliente em espera…',
  customer_queued: 'Cliente em espera',
  consult_ringing: 'Chamando o colega…',
  consulting: 'Falando com o colega',
  returning_to_customer: 'Retomando o cliente…',
  with_customer: 'Você está com o cliente',
  handoff_pending: 'Passando para o colega…',
  completed: 'Transferência concluída',
  canceled: 'Espera encerrada',
  failed: 'Falha na transferência',
};

// States that only render a spinner (no soft action). After a short delay we
// reveal an escape button so the agent is never trapped behind the spinner.
const TRAPPED_STATES = ['parking_customer', 'returning_to_customer', 'handoff_pending'];

export function CallTransferControls() {
  const {
    activeCallId,
    canTransferCalls,
    transferSession,
    transferTargets,
    transferOperation,
    loadTransferTargets,
    startTransfer,
    controlTransfer,
    escapeTransfer,
    activeIncomingCallInfo,
  } = useOutboundCall();
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [showEscape, setShowEscape] = useState(false);

  const state = transferSession?.state;
  const busy = transferOperation !== null || (!!state && TRAPPED_STATES.includes(state));

  // Reveal the escape button after ~5s stuck in a busy/transitional state.
  useEffect(() => {
    setShowEscape(false);
    if (!busy) return;
    const timer = window.setTimeout(() => setShowEscape(true), 5000);
    return () => window.clearTimeout(timer);
  }, [busy, state]);

  if (!activeCallId || !canTransferCalls) return null;
  // A consultation recipient cannot start another hold before the current
  // handoff is complete.
  if (!transferSession && activeIncomingCallInfo?.transferRole === 'consult') return null;

  const openTargets = async () => {
    setTargetDialogOpen(true);
    await loadTransferTargets();
  };

  const pickTarget = async (target: CallTransferTarget) => {
    setTargetDialogOpen(false);
    // In-session (customer already on hold) => consult a different colleague;
    // otherwise this is the initial hold.
    if (transferSession) {
      await controlTransfer('consult_again', { targetUserId: target.userId, targetName: target.fullName });
    } else {
      await startTransfer(target);
    }
  };

  const processingLabel = transferOperation === 'starting'
    ? 'Colocando o cliente em espera…'
    : transferOperation === 'returning'
      ? 'Retomando o cliente…'
      : transferOperation === 'consulting_again'
        ? 'Preparando nova consulta…'
        : transferOperation === 'completing'
          ? `Passando para ${transferSession?.targetName ?? 'o colega'}…`
          : transferOperation === 'canceling'
            ? 'Encerrando a espera…'
            : transferOperation === 'recovering'
              ? 'Recuperando o cliente…'
              : 'Aguardando confirmação da Twilio…';

  const targetDialog = (
    <Dialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{transferSession ? 'Chamar outro colega' : 'Colocar cliente em espera'}</DialogTitle>
          <DialogDescription>O cliente fica em espera enquanto você conversa em particular com o colega.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {transferOperation === 'loading_targets' ? (
            <div className="flex items-center justify-center py-8"><SpinnerGap className="h-6 w-6 animate-spin" /></div>
          ) : transferTargets.length === 0 ? (
            <Alert><AlertDescription>Nenhum colega está online e disponível no momento.</AlertDescription></Alert>
          ) : transferTargets.map((target) => (
            <Button key={target.userId} variant="outline" className="h-auto w-full justify-start p-3 text-left"
              onClick={() => void pickTarget(target)}>
              <PhoneCall className="mr-3 h-5 w-5 text-primary" />
              <span><span className="block font-medium">{target.fullName}</span>{target.email && <span className="block text-xs text-muted-foreground">{target.email}</span>}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );

  // No active hold yet: the primary action is "put the customer on hold".
  if (!transferSession) {
    return (
      <>
        <Button variant="outline" onClick={() => void openTargets()}>
          <Pause className="mr-2 h-4 w-4" /> Colocar em espera
        </Button>
        {targetDialog}
      </>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">Cliente em espera</p>
          <p className="truncate text-xs text-muted-foreground">Colega: {transferSession.targetName}</p>
        </div>
        <Badge variant={state === 'failed' ? 'destructive' : 'outline'}>{STATE_LABELS[state ?? ''] || state}</Badge>
      </div>
      {transferSession.error && <p className="text-xs text-destructive">{transferSession.error}</p>}

      {/* Colleague being rung: bring the customer back if you change your mind. */}
      {['customer_queued', 'consult_ringing'].includes(state ?? '') && (
        <Button variant="outline" className="w-full" disabled={busy} onClick={() => void controlTransfer('return_to_customer')}>
          <ArrowUUpLeft className="mr-2 h-4 w-4" /> Retomar cliente
        </Button>
      )}

      {/* Talking privately with the colleague: hand over, come back, or try someone else. */}
      {state === 'consulting' && (
        <div className="space-y-2">
          <Button className="w-full" disabled={busy} onClick={() => void controlTransfer('complete')}>
            <UserSwitch className="mr-2 h-4 w-4" /> Passar cliente para {transferSession.targetName}
          </Button>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" disabled={busy} onClick={() => void controlTransfer('return_to_customer')}>
              <ArrowUUpLeft className="mr-2 h-4 w-4" /> Retomar cliente
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void openTargets()}>
              <Users className="mr-2 h-4 w-4" /> Chamar outra pessoa
            </Button>
          </div>
        </div>
      )}

      {/* Customer back with you: consult again (same/other) or end the hold. */}
      {state === 'with_customer' && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" disabled={busy} onClick={() => void openTargets()}>
              <Users className="mr-2 h-4 w-4" /> Chamar outra pessoa
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void controlTransfer('consult_again')}>
              <ArrowsLeftRight className="mr-2 h-4 w-4" /> Consultar {transferSession.targetName} de novo
            </Button>
          </div>
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void controlTransfer('cancel')}>
            Encerrar espera (seguir com o cliente)
          </Button>
        </div>
      )}

      {busy && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <SpinnerGap className="h-3 w-3 animate-spin" /> {processingLabel}
        </div>
      )}

      {/* Never let a transitional state trap the agent behind the spinner. */}
      {showEscape && (
        <Button variant="destructive" className="w-full" onClick={() => void escapeTransfer()}>
          <PhoneSlash className="mr-2 h-4 w-4" /> Encerrar transferência
        </Button>
      )}

      {targetDialog}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { ArrowsLeftRight, ArrowUUpLeft, Pause, PhoneCall, PhoneSlash, SpinnerGap, UserSwitch, Users } from '@phosphor-icons/react';
import { useOutboundCall } from '@/contexts/OutboundCallContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CallTransferTarget } from '@/contexts/outbound-call/types';

// Hold (espera) is INDEPENDENT of transfer, DivusApp-style: put the customer on
// hold first; only then decide to resume or to consult/transfer a colleague.
const STATE_LABELS: Record<string, string> = {
  parking_customer: 'Colocando cliente em espera…',
  on_hold: 'Cliente em espera',
  customer_queued: 'Chamando o colega…',
  consult_ringing: 'Chamando o colega…',
  consulting: 'Falando com o colega',
  returning_to_customer: 'Retomando o cliente…',
  with_customer: 'Você está com o cliente',
  handoff_pending: 'Passando para o colega…',
  completed: 'Transferência concluída',
  canceled: 'Espera encerrada',
  failed: 'Falha na transferência',
};

// Transitional states that only show a spinner; reveal an escape after a delay.
const TRAPPED_STATES = ['parking_customer', 'returning_to_customer', 'handoff_pending'];

export function CallTransferControls() {
  const {
    activeCallId,
    canTransferCalls,
    transferSession,
    transferTargets,
    transferOperation,
    audioReconnecting,
    loadTransferTargets,
    holdCall,
    controlTransfer,
    escapeTransfer,
    activeIncomingCallInfo,
  } = useOutboundCall();
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [showEscape, setShowEscape] = useState(false);

  const state = transferSession?.state;
  const busy = transferOperation !== null || (!!state && TRAPPED_STATES.includes(state));

  useEffect(() => {
    setShowEscape(false);
    if (!busy) return;
    const timer = window.setTimeout(() => setShowEscape(true), 5000);
    return () => window.clearTimeout(timer);
  }, [busy, state]);

  if (!activeCallId || !canTransferCalls) return null;
  if (!transferSession && activeIncomingCallInfo?.transferRole === 'consult') return null;

  const openPicker = async () => {
    setTargetDialogOpen(true);
    await loadTransferTargets();
  };

  const pickTarget = async (target: CallTransferTarget) => {
    setTargetDialogOpen(false);
    // From on_hold => first consult (customer already parked). From an active
    // consult (consulting / with_customer) => switch to another colleague.
    if (state === 'on_hold') {
      await controlTransfer('consult', { targetUserId: target.userId, targetName: target.fullName });
    } else {
      await controlTransfer('consult_again', { targetUserId: target.userId, targetName: target.fullName });
    }
  };

  const processingLabel = transferOperation === 'starting'
    ? 'Colocando o cliente em espera…'
    : transferOperation === 'returning'
      ? 'Retomando o cliente…'
      : transferOperation === 'consulting_again'
        ? 'Preparando a consulta…'
        : transferOperation === 'completing'
          ? `Passando para ${transferSession?.targetName || 'o colega'}…`
          : transferOperation === 'canceling'
            ? 'Encerrando a espera…'
            : transferOperation === 'recovering'
              ? 'Recuperando o cliente…'
              : 'Aguardando confirmação da Twilio…';

  const targetDialog = (
    <Dialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chamar um colega</DialogTitle>
          <DialogDescription>O cliente continua em espera enquanto você conversa em particular com o colega.</DialogDescription>
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

  // Live call, nothing on hold yet: the only action is to put on hold.
  if (!transferSession) {
    return (
      <Button variant="outline" onClick={() => void holdCall()}>
        <Pause className="mr-2 h-4 w-4" /> Colocar em espera
      </Button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {state === 'on_hold' ? 'Cliente em espera' : transferSession.targetName ? `Colega: ${transferSession.targetName}` : 'Cliente em espera'}
          </p>
        </div>
        <Badge variant={state === 'failed' ? 'destructive' : 'outline'}>{STATE_LABELS[state ?? ''] || state}</Badge>
      </div>
      {transferSession.error && <p className="text-xs text-destructive">{transferSession.error}</p>}

      {/* Customer on hold, no colleague yet: resume OR call a colleague. */}
      {state === 'on_hold' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" disabled={busy} onClick={() => void controlTransfer('resume')}>
            <ArrowUUpLeft className="mr-2 h-4 w-4" /> Retomar cliente
          </Button>
          <Button disabled={busy} onClick={() => void openPicker()}>
            <Users className="mr-2 h-4 w-4" /> Transferir / Chamar colega
          </Button>
        </div>
      )}

      {/* Colleague being rung: abort back to the customer if needed. */}
      {['customer_queued', 'consult_ringing'].includes(state ?? '') && (
        <Button variant="outline" className="w-full" disabled={busy} onClick={() => void controlTransfer('return_to_customer')}>
          <ArrowUUpLeft className="mr-2 h-4 w-4" /> Retomar cliente
        </Button>
      )}

      {/* Talking to the colleague: hand over, try another, or come back. */}
      {state === 'consulting' && (
        <div className="space-y-2">
          <Button className="w-full" disabled={busy} onClick={() => void controlTransfer('complete')}>
            <UserSwitch className="mr-2 h-4 w-4" /> Passar cliente para {transferSession.targetName}
          </Button>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" disabled={busy} onClick={() => void controlTransfer('return_to_customer')}>
              <ArrowUUpLeft className="mr-2 h-4 w-4" /> Retomar cliente
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void openPicker()}>
              <Users className="mr-2 h-4 w-4" /> Chamar outra pessoa
            </Button>
          </div>
        </div>
      )}

      {/* Back with the customer after a consult: consult again or end the mode. */}
      {state === 'with_customer' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" disabled={busy} onClick={() => void openPicker()}>
            <ArrowsLeftRight className="mr-2 h-4 w-4" /> Chamar colega
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void controlTransfer('cancel')}>
            Encerrar espera
          </Button>
        </div>
      )}

      {(busy || audioReconnecting) && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <SpinnerGap className="h-3 w-3 animate-spin" /> {audioReconnecting ? 'Reconectando áudio…' : processingLabel}
        </div>
      )}

      {showEscape && (
        <Button variant="destructive" className="w-full" onClick={() => void escapeTransfer()}>
          <PhoneSlash className="mr-2 h-4 w-4" /> Encerrar transferência
        </Button>
      )}

      {targetDialog}
    </div>
  );
}

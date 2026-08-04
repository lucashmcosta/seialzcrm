import { useState } from 'react';
import { ArrowUUpLeft, ArrowsLeftRight, PhoneCall, SpinnerGap, UserSwitch } from '@phosphor-icons/react';
import { useOutboundCall } from '@/contexts/OutboundCallContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const STATE_LABELS: Record<string, string> = {
  parking_customer: 'Colocando cliente em espera…',
  customer_queued: 'Cliente em espera',
  consult_ringing: 'Chamando o colega…',
  consulting: 'Consulta privada',
  returning_to_customer: 'Voltando para o cliente…',
  with_customer: 'Você está com o cliente',
  handoff_pending: 'Concluindo transferência…',
  completed: 'Transferência concluída',
  canceled: 'Transferência encerrada',
  failed: 'Falha na transferência',
};

export function CallTransferControls() {
  const {
    activeCallId,
    canTransferCalls,
    transferSession,
    transferTargets,
    transferLoading,
    transferOperation,
    loadTransferTargets,
    startTransfer,
    controlTransfer,
    activeIncomingCallInfo,
  } = useOutboundCall();
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);

  if (!activeCallId || !canTransferCalls) return null;
  // A consultation recipient cannot start another transfer before the current
  // handoff is complete.
  if (!transferSession && activeIncomingCallInfo?.transferRole === 'consult') return null;

  if (!transferSession) {
    return (
      <>
        <Button variant="outline" onClick={async () => { setTargetDialogOpen(true); await loadTransferTargets(); }}>
          <UserSwitch className="mr-2 h-4 w-4" /> Transferir
        </Button>
        <Dialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Consultar e transferir</DialogTitle>
              <DialogDescription>O cliente ficará em espera enquanto você conversa em particular com o colega.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {transferOperation === 'loading_targets' ? (
                <div className="flex items-center justify-center py-8"><SpinnerGap className="h-6 w-6 animate-spin" /></div>
              ) : transferTargets.length === 0 ? (
                <Alert><AlertDescription>Nenhum usuário está online e disponível para receber a transferência.</AlertDescription></Alert>
              ) : transferTargets.map((target) => (
                <Button key={target.userId} variant="outline" className="h-auto w-full justify-start p-3 text-left"
                  onClick={async () => { setTargetDialogOpen(false); await startTransfer(target); }}>
                  <PhoneCall className="mr-3 h-5 w-5 text-primary" />
                  <span><span className="block font-medium">{target.fullName}</span>{target.email && <span className="block text-xs text-muted-foreground">{target.email}</span>}</span>
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const state = transferSession.state;
  const busy = transferLoading || ['parking_customer', 'returning_to_customer', 'handoff_pending'].includes(state);
  const processingLabel = transferOperation === 'starting'
    ? 'Colocando o cliente em espera…'
    : transferOperation === 'returning'
      ? 'Reconectando você ao cliente…'
      : transferOperation === 'consulting_again'
        ? `Preparando nova chamada para ${transferSession.targetName}…`
        : transferOperation === 'completing'
          ? `Transferindo para ${transferSession.targetName}…`
          : transferOperation === 'canceling'
            ? 'Encerrando o modo de transferência…'
            : transferOperation === 'recovering'
              ? 'Recuperando o cliente…'
              : 'Aguardando confirmação da Twilio…';
  return (
    <div className="w-full space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">Transferência para {transferSession.targetName}</p>
          <p className="text-xs text-muted-foreground">Sem chamada em grupo</p>
        </div>
        <Badge variant={state === 'failed' ? 'destructive' : 'outline'}>{STATE_LABELS[state] || state}</Badge>
      </div>
      {transferSession.error && <p className="text-xs text-destructive">{transferSession.error}</p>}
      {['customer_queued', 'consult_ringing'].includes(state) && (
        <Button variant="outline" className="w-full" disabled={busy} onClick={() => void controlTransfer('return_to_customer')}>
          <ArrowUUpLeft className="mr-2 h-4 w-4" /> Falar com cliente
        </Button>
      )}
      {state === 'consulting' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" disabled={busy} onClick={() => void controlTransfer('return_to_customer')}>
            <ArrowUUpLeft className="mr-2 h-4 w-4" /> Falar com cliente
          </Button>
          <Button disabled={busy} onClick={() => void controlTransfer('complete')}>
            <UserSwitch className="mr-2 h-4 w-4" /> Transferir para {transferSession.targetName}
          </Button>
        </div>
      )}
      {state === 'with_customer' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" disabled={busy} onClick={() => void controlTransfer('consult_again')}>
            <ArrowsLeftRight className="mr-2 h-4 w-4" /> Consultar {transferSession.targetName} novamente
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void controlTransfer('cancel')}>Encerrar modo de transferência</Button>
        </div>
      )}
      {busy && <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><SpinnerGap className="h-3 w-3 animate-spin" /> {processingLabel}</div>}
    </div>
  );
}

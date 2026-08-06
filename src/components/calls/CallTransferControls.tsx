import { useEffect, useState } from 'react';
import { ArrowsLeftRight, ArrowUUpLeft, Pause, PhoneCall, PhoneSlash, Play, SpinnerGap, UserSwitch, Users } from '@phosphor-icons/react';
import { useOutboundCall } from '@/contexts/OutboundCallContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CallTransferTarget } from '@/contexts/outbound-call/types';

// ESPERA (hold) e TRANSFERÊNCIA são controles SEPARADOS aqui, como mudo x teclado.
// - Espera: coloca o cliente em espera / retoma (nenhum colega envolvido).
// - Transferência: consulta/passa para um colega (o cliente fica em espera durante).
// Colocar em espera e retomar formam um ciclo próprio; retomar volta ao normal.
const STATE_LABELS: Record<string, string> = {
  parking_customer: 'Colocando em espera…',
  on_hold: 'Cliente em espera',
  customer_queued: 'Chamando o colega…',
  consult_ringing: 'Chamando o colega…',
  consulting: 'Falando com o colega',
  returning_to_customer: 'Voltando ao cliente…',
  with_customer: 'Você está com o cliente',
  handoff_pending: 'Passando para o colega…',
  completed: 'Transferência concluída',
  canceled: 'Encerrada',
  failed: 'Falha',
};

// Estados transitórios (aguardam um callback da Twilio para avançar). NÃO travam a
// UI com spinner: o modal mostra o label do estado e, se demorar além de 5s, revela
// a saída de emergência.
const TRANSITIONAL_STATES = ['parking_customer', 'customer_queued', 'consult_ringing', 'returning_to_customer', 'handoff_pending'];

// Estados em que uma TRANSFERÊNCIA está em andamento (colega envolvido) — mostram
// os controles de transferência em vez dos de espera.
const TRANSFER_STATES = ['customer_queued', 'consult_ringing', 'consulting', 'with_customer', 'handoff_pending'];

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
  // inFlight = uma ação do usuário está a caminho (evita duplo-clique). O estado do
  // modal já reflete o alvo de forma otimista. transitional revela a saída se demorar.
  const inFlight = transferOperation !== null;
  const transitional = !!state && TRANSITIONAL_STATES.includes(state);

  useEffect(() => {
    setShowEscape(false);
    if (!transitional) return;
    const timer = window.setTimeout(() => setShowEscape(true), 5000);
    return () => window.clearTimeout(timer);
  }, [transitional, state]);

  if (!activeCallId || !canTransferCalls) return null;
  if (!transferSession && activeIncomingCallInfo?.transferRole === 'consult') return null;

  const openPicker = async () => {
    setTargetDialogOpen(true);
    await loadTransferTargets();
  };

  const pickTarget = async (target: CallTransferTarget) => {
    setTargetDialogOpen(false);
    // De on_hold => 1ª consulta (cliente já parkeado). De um consult ativo
    // (consulting / with_customer) => trocar de colega.
    if (state === 'on_hold') {
      await controlTransfer('consult', { targetUserId: target.userId, targetName: target.fullName });
    } else {
      await controlTransfer('consult_again', { targetUserId: target.userId, targetName: target.fullName });
    }
  };

  // Transferir a partir de uma chamada normal: coloca o cliente em espera e abre o
  // seletor de colega (a espera é o pré-requisito técnico da transferência).
  const startTransferFlow = async () => {
    await holdCall();
    await openPicker();
  };

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

  // ───────── Chamada normal (sem sessão): ESPERA e TRANSFERIR, controles separados.
  if (!transferSession) {
    return (
      <>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={() => void holdCall()}>
            <Pause className="mr-2 h-4 w-4" /> Colocar em espera
          </Button>
          <Button variant="outline" onClick={() => void startTransferFlow()}>
            <ArrowsLeftRight className="mr-2 h-4 w-4" /> Transferir
          </Button>
        </div>
        {targetDialog}
      </>
    );
  }

  const inTransfer = !!state && TRANSFER_STATES.includes(state);

  return (
    <div className="w-full space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">
          {inTransfer ? (transferSession.targetName ? `Transferência • ${transferSession.targetName}` : 'Transferência') : 'Espera'}
        </p>
        <Badge variant={state === 'failed' ? 'destructive' : 'outline'}>{STATE_LABELS[state ?? ''] || state}</Badge>
      </div>
      {transferSession.error && <p className="text-xs text-destructive">{transferSession.error}</p>}

      {/* ══ ESPERA ══ Cliente em espera (sem colega): retomar é a ação principal;
          transferir para um colega fica numa seção separada abaixo. */}
      {state === 'on_hold' && (
        <div className="space-y-2">
          <Button className="w-full" disabled={inFlight} onClick={() => void controlTransfer('resume')}>
            <Play className="mr-2 h-4 w-4" /> Retomar cliente
          </Button>
          <div className="border-t border-primary/10 pt-2">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Transferência</p>
            <Button variant="outline" className="w-full" disabled={inFlight} onClick={() => void openPicker()}>
              <Users className="mr-2 h-4 w-4" /> Chamar um colega
            </Button>
          </div>
        </div>
      )}

      {/* ══ TRANSFERÊNCIA ══ Colega sendo chamado: abortar de volta ao cliente. */}
      {['customer_queued', 'consult_ringing'].includes(state ?? '') && (
        <Button variant="outline" className="w-full" disabled={inFlight} onClick={() => void controlTransfer('return_to_customer')}>
          <ArrowUUpLeft className="mr-2 h-4 w-4" /> Voltar ao cliente
        </Button>
      )}

      {/* Falando com o colega: passar, tentar outro, ou voltar ao cliente. */}
      {state === 'consulting' && (
        <div className="space-y-2">
          <Button className="w-full" disabled={inFlight} onClick={() => void controlTransfer('complete')}>
            <UserSwitch className="mr-2 h-4 w-4" /> Passar cliente para {transferSession.targetName}
          </Button>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" disabled={inFlight} onClick={() => void controlTransfer('return_to_customer')}>
              <ArrowUUpLeft className="mr-2 h-4 w-4" /> Voltar ao cliente
            </Button>
            <Button variant="outline" disabled={inFlight} onClick={() => void openPicker()}>
              <Users className="mr-2 h-4 w-4" /> Outro colega
            </Button>
          </div>
        </div>
      )}

      {/* De volta com o cliente após uma consulta: consultar de novo ou encerrar. */}
      {state === 'with_customer' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" disabled={inFlight} onClick={() => void openPicker()}>
            <ArrowsLeftRight className="mr-2 h-4 w-4" /> Chamar colega
          </Button>
          <Button variant="secondary" disabled={inFlight} onClick={() => void controlTransfer('cancel')}>
            Encerrar transferência
          </Button>
        </div>
      )}

      {audioReconnecting && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <SpinnerGap className="h-3 w-3 animate-spin" /> Reconectando áudio…
        </div>
      )}

      {showEscape && (
        <Button variant="destructive" className="w-full" onClick={() => void escapeTransfer()}>
          <PhoneSlash className="mr-2 h-4 w-4" /> {state === 'on_hold' ? 'Encerrar espera' : 'Encerrar transferência'}
        </Button>
      )}

      {targetDialog}
    </div>
  );
}

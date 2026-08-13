// ============================================================================
// Fase 3.1 — Modal de conexão do WhatsApp Comercial (QR real da Evolution).
//
// Contrato de sucesso (estrito, sem coerção):
//   connected === true && identityKnown === true && identityMatchesEndpoint === true
//
// `null`, `undefined` ou estado indeterminado NUNCA são sucesso. Enquanto as
// três condições não forem explicitamente TRUE o modal permanece aberto e
// exibe o motivo. A identidade vem exclusivamente da resposta real do servidor
// Evolution (sincronizada server-side).
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  useEvolutionInstanceState, useSalesRouteManager,
} from '@/hooks/settings/useSalesRouteManager';
import { ArrowsClockwise, CheckCircle, QrCode, SpinnerGap, WarningCircle } from '@phosphor-icons/react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null;
  instanceName: string | null;
  endpointId?: string | null;
  onConnected?: () => void;
}

export function SalesWhatsAppConnectDialog({
  open, onOpenChange, organizationId, instanceName, endpointId, onConnected,
}: Props) {
  const { connectInstance, invalidate } = useSalesRouteManager(organizationId);
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const state = useEvolutionInstanceState({
    organizationId,
    instanceName,
    endpointId: endpointId ?? null,
    enabled: open,
  });

  const requestQr = async () => {
    if (!instanceName) return;
    setStartError(null);
    try {
      const res = await connectInstance.mutateAsync({ instanceName });
      setQr(res.qrBase64 ?? null);
      setPairingCode(res.pairingCode ?? null);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Falha ao gerar QR Code');
    }
  };

  // Abre o modal já solicitando o QR.
  useEffect(() => {
    if (open && instanceName) {
      setQr(null);
      setPairingCode(null);
      void requestQr();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instanceName]);

  const s = state.data;
  const connected = s?.connected === true;
  const identityKnown = s?.identityKnown === true;
  const identityMatches = s?.identityMatchesEndpoint === true;

  // ÚNICA condição de sucesso aceita.
  const success = connected === true && identityKnown === true && identityMatches === true;

  useEffect(() => {
    if (!open) return;
    if (success) {
      invalidate();
      onConnected?.();
      onOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, success]);

  const problem = useMemo(() => {
    if (!s || success) return null;
    if (s.error) return s.message ? `${s.error}: ${s.message}` : s.error;
    if (connected && !identityKnown) return 'Identidade não confirmada';
    if (s.identityMatchesEndpoint === false) {
      return 'O número conectado diverge do número deste endpoint';
    }
    return null;
  }, [s, success, connected, identityKnown]);

  const humanState = connected
    ? (identityKnown ? 'Validando identidade…' : 'Conectado — identidade não confirmada')
    : s?.state === 'connecting'
      ? 'Conectando…'
      : 'Aguardando leitura do QR Code';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Conectar WhatsApp</DialogTitle>
          <DialogDescription className="text-xs">
            Abra o WhatsApp no celular, vá em Aparelhos conectados e leia o código abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          {connectInstance.isPending && !qr && (
            <div className="flex h-56 w-56 items-center justify-center rounded-md border border-border">
              <SpinnerGap className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!connectInstance.isPending && qr && (
            <img
              src={qr}
              alt="QR Code para conectar o WhatsApp Comercial"
              className="h-56 w-56 rounded-md border border-border bg-background object-contain"
            />
          )}

          {!connectInstance.isPending && !qr && !startError && (
            <div className="flex h-56 w-56 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-muted-foreground">
              <QrCode className="h-8 w-8" />
              <span className="text-[11px]">QR Code indisponível</span>
            </div>
          )}

          {pairingCode && (
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Código de pareamento
              </div>
              <div className="font-data text-sm">{pairingCode}</div>
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {connected
              ? <CheckCircle className="h-3.5 w-3.5 text-primary" weight="fill" />
              : <SpinnerGap className="h-3.5 w-3.5 animate-spin" />}
            {humanState}
          </div>

          {startError && (
            <Alert variant="destructive">
              <WarningCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{startError}</AlertDescription>
            </Alert>
          )}

          {problem && (
            <Alert variant="destructive">
              <WarningCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {problem}
                {s?.ownerMasked || s?.expectedMasked ? (
                  <span className="block font-data text-[10px] mt-1">
                    conectado: {s?.ownerMasked ?? '—'} · endpoint: {s?.expectedMasked ?? '—'}
                  </span>
                ) : null}
                <span className="block mt-1">
                  Enquanto isso, este número não pode ser marcado como ativo para envio.
                </span>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex w-full justify-between">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            <Button
              variant="outline" size="sm"
              disabled={connectInstance.isPending}
              onClick={() => void requestQr()}
            >
              <ArrowsClockwise className="h-3.5 w-3.5 mr-1" /> Atualizar QR
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

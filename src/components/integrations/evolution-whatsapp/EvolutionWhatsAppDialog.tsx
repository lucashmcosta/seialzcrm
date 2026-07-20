import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import { useOrganization } from "@/hooks/useOrganization";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowsClockwise,
  Broadcast,
  CheckCircle,
  Info,
  Plug,
  QrCode,
  SpinnerGap,
  WarningCircle,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";

import {
  useEvolutionEndpoints,
  useEvolutionInstances,
  useConnectInstance,
  useConnectionState,
  useLogoutInstance,
  useWebhookSet,
  type EvolutionConnectionState,
  type EvolutionInstanceRow,
} from "@/hooks/useEvolutionInstances";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATE_LABEL: Record<EvolutionConnectionState, string> = {
  open: "Conectado",
  connecting: "Conectando",
  close: "Desconectado",
  unknown: "—",
};

const STATE_STYLE: Record<EvolutionConnectionState, string> = {
  open: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  connecting: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  close: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

function StatusPill({
  state,
  hasQr,
}: {
  state: EvolutionConnectionState | null;
  hasQr: boolean;
}) {
  const s: EvolutionConnectionState = state ?? "unknown";
  const label = s === "close" && hasQr ? "QR disponível" : STATE_LABEL[s];
  return (
    <Badge variant="outline" className={STATE_STYLE[s]}>
      {label}
    </Badge>
  );
}

function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return raw.startsWith("+") ? raw : `+${digits}`;
}

function InstanceCard({ instance }: { instance: EvolutionInstanceRow }) {
  const { data: endpoints } = useEvolutionEndpoints();
  const endpoint = endpoints?.find((e) => e.id === instance.endpoint_id);

  const connect = useConnectInstance();
  const logout = useLogoutInstance();
  const state = useConnectionState();
  const webhook = useWebhookSet();

  const [qr, setQr] = useState<string | null>(null);
  const [health, setHealth] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const connState: EvolutionConnectionState = instance.last_known_state ?? "unknown";
  const isOpen = connState === "open";
  const hasQr =
    !!instance.last_qr_expires_at &&
    new Date(instance.last_qr_expires_at).getTime() > Date.now();

  const lastSyncLabel = useMemo(() => {
    if (!instance.last_state_checked_at) return "—";
    try {
      return formatDistanceToNow(new Date(instance.last_state_checked_at), {
        addSuffix: true,
        locale: ptBR,
      });
    } catch {
      return "—";
    }
  }, [instance.last_state_checked_at]);

  const onGenerateQr = async () => {
    setQr(null);
    try {
      const r = await connect.mutateAsync(instance.instance_name);
      setQr(r.base64 ?? null);
      if (!r.base64) {
        toast.message("Já conectado", {
          description: "Nenhum QR gerado — o WhatsApp já está pareado.",
        });
      } else {
        toast.success("QR Code gerado");
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onRefreshState = async () => {
    try {
      const r = await state.mutateAsync(instance.instance_name);
      toast.message("Estado atualizado", { description: STATE_LABEL[r.state] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onDisconnect = async () => {
    try {
      await logout.mutateAsync(instance.instance_name);
      setQr(null);
      toast.success("WhatsApp desconectado");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onUpdateWebhook = async () => {
    try {
      await webhook.mutateAsync({ instanceName: instance.instance_name });
      toast.success("Webhook atualizado");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onHealthCheck = async () => {
    setHealth(null);
    setHealthLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "evolution-instance-manager",
        { body: { op: "fetch" } },
      );
      if (error) throw new Error(error.message);
      if (data && typeof data === "object" && "error" in data) {
        setHealth(`⚠ ${(data as { error: string }).error}`);
      } else {
        setHealth("✓ Comunicação com o servidor OK");
      }
    } catch (e) {
      setHealth(`✗ ${(e as Error).message}`);
    } finally {
      setHealthLoading(false);
    }
  };

  const phone = formatPhone(endpoint?.external_address);

  return (
    <div className="space-y-4">
      {/* Status hero */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10">
                <WhatsappLogo className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-medium">
                    {endpoint?.display_name || "WhatsApp Evolution"}
                  </h3>
                  <StatusPill state={connState} hasQr={hasQr} />
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {isOpen ? (
                    <>Número conectado: <span className="font-medium text-foreground">{phone}</span></>
                  ) : (
                    <>Ainda não conectado. Gere um QR Code para vincular seu WhatsApp.</>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              Última sincronização: {lastSyncLabel}
            </div>
          </div>

          {isOpen && (
            <Alert className="mt-4 border-emerald-500/40 bg-emerald-500/5">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <AlertTitle>WhatsApp conectado com sucesso</AlertTitle>
              <AlertDescription className="text-sm">
                Número: <span className="font-medium">{phone}</span> · Estado: <span className="font-mono">OPEN</span>
              </AlertDescription>
            </Alert>
          )}

          {!isOpen && qr && (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-6">
              <div className="text-xs text-muted-foreground text-center max-w-xs">
                No seu WhatsApp, abra <span className="font-medium">Configurações → Aparelhos conectados → Conectar um aparelho</span> e aponte a câmera para o QR abaixo.
              </div>
              <img
                src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                alt="QR Code"
                className="w-64 h-64 rounded-md bg-white p-2"
              />
            </div>
          )}

          {!isOpen && !qr && hasQr && (
            <Alert className="mt-4">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Há um QR pendente no servidor. Clique em <span className="font-medium">Gerar QR</span> para exibi-lo.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {!isOpen && (
          <Button onClick={onGenerateQr} disabled={connect.isPending}>
            {connect.isPending ? (
              <SpinnerGap className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <QrCode className="h-4 w-4 mr-2" />
            )}
            {qr ? "Atualizar QR" : "Gerar QR Code"}
          </Button>
        )}
        <Button variant="outline" onClick={onRefreshState} disabled={state.isPending}>
          {state.isPending ? (
            <SpinnerGap className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ArrowsClockwise className="h-4 w-4 mr-2" />
          )}
          Atualizar estado
        </Button>
        <Button variant="outline" onClick={onUpdateWebhook} disabled={webhook.isPending}>
          {webhook.isPending ? (
            <SpinnerGap className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Broadcast className="h-4 w-4 mr-2" />
          )}
          Atualizar webhook
        </Button>
        <Button variant="outline" onClick={onHealthCheck} disabled={healthLoading}>
          {healthLoading ? (
            <SpinnerGap className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4 mr-2" />
          )}
          Health check
        </Button>
        {isOpen && (
          <Button variant="outline" onClick={onDisconnect} disabled={logout.isPending}>
            {logout.isPending ? (
              <SpinnerGap className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plug className="h-4 w-4 mr-2" />
            )}
            Desconectar
          </Button>
        )}
      </div>
      {health && <div className="text-sm text-muted-foreground">{health}</div>}

      <Separator />

      {/* Metadata (business-friendly labels only) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Número conectado</div>
          <div className="font-medium">{isOpen ? phone : "Aguardando conexão"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Estado</div>
          <div className="font-medium">
            {isOpen ? "OPEN" : STATE_LABEL[connState]}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Última sincronização</div>
          <div className="font-medium">{lastSyncLabel}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Canal</div>
          <div className="font-medium">
            {endpoint?.display_name || "WhatsApp"}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EvolutionWhatsAppDialog({ open, onOpenChange }: Props) {
  const { organization } = useOrganization();
  const { data: instances, isLoading, error, refetch } = useEvolutionInstances();

  const myInstances = useMemo(
    () =>
      (instances ?? []).filter(
        (i) => !organization?.id || i.organization_id === organization.id,
      ),
    [instances, organization?.id],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WhatsappLogo className="h-5 w-5 text-emerald-600" />
            Evolution WhatsApp
          </DialogTitle>
          <DialogDescription>
            Conecte seu WhatsApp através da Evolution API. As credenciais e a infraestrutura são gerenciadas pela equipe Seialz.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <WarningCircle className="h-4 w-4" />
            <AlertTitle>Não foi possível carregar</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : myInstances.length === 0 ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Sua instância ainda não está provisionada</AlertTitle>
            <AlertDescription className="text-sm">
              Fale com o suporte Seialz para provisionar seu canal Evolution. Assim que ele estiver pronto, você poderá conectar seu WhatsApp por esta tela.
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  <ArrowsClockwise className="h-4 w-4 mr-2" /> Atualizar
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            {myInstances.map((i) => (
              <InstanceCard key={i.id} instance={i} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

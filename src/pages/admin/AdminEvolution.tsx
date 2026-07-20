import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  useEvolutionInstances,
  useEvolutionEndpoints,
  useConnectInstance,
  useLogoutInstance,
  useDeleteInstance,
  useConnectionState,
  useCreateInstance,
  useWebhookSet,
  type EvolutionConnectionState,
  type EvolutionInstanceRow,
} from "@/hooks/useEvolutionInstances";
import { WarningCircle, Plug, PlugsConnected, ArrowsClockwise, Trash, QrCode, SpinnerGap, Broadcast } from "@phosphor-icons/react";

// Admin — Evolution API (Production Ready).
// Superfície reservada à equipe Seialz para provisionar e monitorar
// instâncias Evolution. Tenants conectam o WhatsApp pela tela de
// Configurações → Integrações → Evolution WhatsApp (dialog do tenant).

function StateBadge({ state }: { state: EvolutionConnectionState | null }) {
  const s = state ?? "unknown";
  const map: Record<EvolutionConnectionState, string> = {
    open: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    connecting: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    close: "bg-rose-500/15 text-rose-600 border-rose-500/30",
    unknown: "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={map[s as EvolutionConnectionState]}>{s}</Badge>;
}

function useFeatureFlag() {
  return useQuery({
    queryKey: ["feature-flag", "evolution_api_enabled"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("is_enabled, organization_ids")
        .eq("name", "evolution_api_enabled")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function InstanceRow({ instance }: { instance: EvolutionInstanceRow }) {
  const connect = useConnectInstance();
  const logout = useLogoutInstance();
  const del = useDeleteInstance();
  const state = useConnectionState();
  const webhook = useWebhookSet();

  const [qr, setQr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const onConnect = async () => {
    try {
      const r = await connect.mutateAsync(instance.instance_name);
      setQr(r.base64 ?? null);
      toast({ title: "QR gerado", description: r.pairingCode ? `Pairing: ${r.pairingCode}` : "Escaneie o QR" });
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  };

  const onLogout = async () => {
    try {
      await logout.mutateAsync(instance.instance_name);
      toast({ title: "Instância desconectada" });
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  };

  const onState = async () => {
    try {
      const r = await state.mutateAsync(instance.instance_name);
      toast({ title: "Estado", description: r.state });
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  };

  const onWebhook = async () => {
    try {
      // A URL do webhook (com o secret) é construída no servidor.
      await webhook.mutateAsync({ instanceName: instance.instance_name });
      toast({ title: "Webhook atualizado", description: "URL registrada no servidor Evolution." });
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  };

  const onDelete = async () => {
    try {
      await del.mutateAsync(instance.instance_name);
      toast({ title: "Instância excluída" });
      setConfirmDelete(false);
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base font-medium">{instance.instance_name}</CardTitle>
          <CardDescription className="text-xs mt-1 space-y-0.5">
            <div>Org: <span className="font-mono">{instance.organization_id.slice(0, 8)}…</span></div>
            <div>Endpoint: <span className="font-mono">{instance.endpoint_id.slice(0, 8)}…</span></div>
            <div>Última verificação: {instance.last_state_checked_at ? new Date(instance.last_state_checked_at).toLocaleString() : "—"}</div>
            <div>QR expira: {instance.last_qr_expires_at ? new Date(instance.last_qr_expires_at).toLocaleString() : "—"}</div>
          </CardDescription>
        </div>
        <StateBadge state={instance.last_known_state} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onConnect} disabled={connect.isPending}>
            {connect.isPending ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            <span className="ml-2">Conectar / QR</span>
          </Button>
          <Button size="sm" variant="outline" onClick={onState} disabled={state.isPending}>
            {state.isPending ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <ArrowsClockwise className="h-4 w-4" />}
            <span className="ml-2">Atualizar estado</span>
          </Button>
          <Button size="sm" variant="outline" onClick={onWebhook} disabled={webhook.isPending}>
            {webhook.isPending ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <Broadcast className="h-4 w-4" />}
            <span className="ml-2">Atualizar webhook</span>
          </Button>
          <Button size="sm" variant="outline" onClick={onLogout} disabled={logout.isPending}>
            {logout.isPending ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            <span className="ml-2">Desconectar</span>
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash className="h-4 w-4" />
            <span className="ml-2">Excluir</span>
          </Button>
        </div>
        {qr && (
          <div className="mt-2 rounded-md border p-3 flex flex-col items-center gap-2 bg-muted/30">
            <div className="text-xs text-muted-foreground">Escaneie no WhatsApp → Dispositivos vinculados</div>
            <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="QR Code" className="w-56 h-56" />
          </div>
        )}
      </CardContent>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir instância?</DialogTitle>
            <DialogDescription>
              Isso removerá a instância <span className="font-mono">{instance.instance_name}</span> no servidor Evolution.
              A linha em <span className="font-mono">evolution_instances</span> permanece até limpeza manual.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={onDelete} disabled={del.isPending}>
              {del.isPending && <SpinnerGap className="h-4 w-4 animate-spin mr-2" />}Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CreateInstanceCard() {
  const [name, setName] = useState("");
  const create = useCreateInstance();

  const onCreate = async () => {
    const trimmed = name.trim();
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(trimmed)) {
      toast({ title: "Nome inválido", description: "3–64 chars, [A-Za-z0-9_-]", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync(trimmed);
      toast({ title: "Instância criada no Evolution", description: trimmed });
      setName("");
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Criar instância</CardTitle>
        <CardDescription>
          Provisiona uma nova instância no servidor Evolution. O vínculo com
          <span className="font-mono"> communication_endpoints</span> e
          <span className="font-mono"> evolution_instances</span> é feito
          manualmente pela equipe Seialz durante o onboarding do tenant.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row gap-2 items-end">
        <div className="flex-1 w-full">
          <Label htmlFor="evo-name">Nome da instância</Label>
          <Input id="evo-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="acme-comercial" />
        </div>
        <Button onClick={onCreate} disabled={create.isPending}>
          {create.isPending ? <SpinnerGap className="h-4 w-4 animate-spin mr-2" /> : null}
          Criar
        </Button>
      </CardContent>
    </Card>
  );
}

function HealthCheckCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Health check</CardTitle>
        <CardDescription>Chama <span className="font-mono">op=fetch</span> no manager para validar conectividade com o servidor Evolution.</CardDescription>
      </CardHeader>
      <CardContent>
        <HealthButton />
      </CardContent>
    </Card>
  );
}

function HealthButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("evolution-instance-manager", {
        body: { op: "fetch" },
      });
      if (error) throw new Error(error.message);
      if (data && typeof data === "object" && "error" in data) {
        setResult(`⚠ ${(data as { error: string }).error}`);
      } else {
        const count = Array.isArray((data as { instances?: unknown[] })?.instances)
          ? (data as { instances: unknown[] }).instances.length
          : 0;
        setResult(`✓ OK — ${count} instância(s) no servidor`);
      }
    } catch (e) {
      setResult(`✗ ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={run} disabled={loading}>
        {loading ? <SpinnerGap className="h-4 w-4 animate-spin mr-2" /> : <PlugsConnected className="h-4 w-4 mr-2" />}
        Verificar
      </Button>
      {result && <span className="text-sm text-muted-foreground">{result}</span>}
    </div>
  );
}

export default function AdminEvolution() {
  const flag = useFeatureFlag();
  const instances = useEvolutionInstances();
  const endpoints = useEvolutionEndpoints();

  const flagOn = !!flag.data?.is_enabled;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Evolution API</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Provider WhatsApp adicional. Nesta fase a UI é administrativa; nenhum tenant utiliza Evolution em produção.
          </p>
        </div>

        {!flagOn && (
          <Alert>
            <WarningCircle className="h-4 w-4" />
            <AlertTitle>Feature flag desligada</AlertTitle>
            <AlertDescription>
              <span className="font-mono">evolution_api_enabled</span> está OFF. Todas as operações no manager retornarão
              <span className="font-mono"> FEATURE_DISABLED</span> até que a flag seja ligada. Isso é intencional na Fase 4.
            </AlertDescription>
          </Alert>
        )}

        <HealthCheckCard />
        <CreateInstanceCard />

        <div className="space-y-3">
          <h2 className="text-lg font-medium">Instâncias registradas ({instances.data?.length ?? 0})</h2>
          {instances.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : instances.error ? (
            <Alert variant="destructive">
              <AlertTitle>Erro ao carregar</AlertTitle>
              <AlertDescription>{(instances.error as Error).message}</AlertDescription>
            </Alert>
          ) : (instances.data ?? []).length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma instância registrada em <span className="font-mono">evolution_instances</span>. Na Fase 4 isso é esperado.
            </CardContent></Card>
          ) : (
            <div className="grid gap-3">
              {instances.data!.map((i) => <InstanceRow key={i.id} instance={i} />)}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-medium">Endpoints com provider=evolution_api ({endpoints.data?.length ?? 0})</h2>
          {endpoints.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (endpoints.data ?? []).length === 0 ? (
            <Card><CardContent className="py-6 text-sm text-muted-foreground">Nenhum endpoint criado.</CardContent></Card>
          ) : (
            <div className="grid gap-2">
              {endpoints.data!.map((e) => (
                <Card key={e.id}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{e.display_name ?? e.external_address ?? e.id}</div>
                      <div className="text-xs text-muted-foreground font-mono">{e.id}</div>
                    </div>
                    <Badge variant="outline">{e.status ?? "—"}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

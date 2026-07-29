import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  CheckCircle,
  Clock,
  WarningCircle,
} from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

type Snapshot = {
  external_process_id: string;
  external_contact_id: string | null;
  process_title: string | null;
  cnj: string | null;
  internal_number: string | null;
  phase: string | null;
  stage_name: string | null;
  status_name: string | null;
  area_name: string | null;
  responsible_name: string | null;
  distributed_at: string | null;
  external_url: string | null;
  sync_status: "pending" | "synced" | "conflict" | "error";
  last_event_id: string | null;
  last_error: string | null;
  last_synced_at: string;
};

type SyncEvent = {
  id: string;
  event_type: string;
  direction: "inbound" | "outbound";
  status: string;
  summary: unknown;
  error: string | null;
  occurred_at: string | null;
  created_at: string;
};

export function NammuxOpportunityTab({
  organizationId,
  opportunityId,
  canManage,
}: {
  organizationId: string;
  opportunityId: string;
  canManage: boolean;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [appUrl, setAppUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [snapshotResult, eventsResult, integrationResult] = await Promise.all([
      supabase
        .from("nammux_process_snapshots")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("opportunity_id", opportunityId)
        .maybeSingle(),
      supabase
        .from("nammux_sync_events")
        .select("id,event_type,direction,status,summary,error,occurred_at,created_at")
        .eq("organization_id", organizationId)
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("organization_integrations")
        .select("config_values, integration:admin_integrations!inner(slug)")
        .eq("organization_id", organizationId)
        .eq("admin_integrations.slug", "nammux")
        .maybeSingle(),
    ]);
    if (snapshotResult.error) console.error("Nammux snapshot:", snapshotResult.error);
    if (eventsResult.error) console.error("Nammux events:", eventsResult.error);
    setSnapshot((snapshotResult.data ?? null) as Snapshot | null);
    setEvents((eventsResult.data ?? []) as SyncEvent[]);
    const config = (integrationResult.data?.config_values ?? {}) as Record<string, unknown>;
    setAppUrl(typeof config.app_url === "string" ? config.app_url.replace(/\/+$/, "") : "");
    setLoading(false);
  }, [opportunityId, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const externalUrl = useMemo(() => {
    if (!snapshot?.external_url) return null;
    try {
      return new URL(snapshot.external_url).toString();
    } catch {
      return appUrl ? `${appUrl}/${snapshot.external_url.replace(/^\/+/, "")}` : null;
    }
  }, [appUrl, snapshot?.external_url]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("nammux-replay-opportunity", {
        body: { opportunity_id: opportunityId, reason: "opportunity_tab_manual_sync" },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Falha ao sincronizar");
      toast({
        title: "Sincronização enfileirada",
        description: `Job ${String(data.job_id).slice(0, 8)}…`,
      });
      window.setTimeout(load, 1200);
    } catch (error) {
      toast({
        title: "Erro ao sincronizar com o Nammux",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Carregando integração Nammux…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Vínculo jurídico</h3>
                <SyncBadge status={snapshot?.sync_status ?? "pending"} />
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                O Nammux controla o processo; esta aba mantém uma projeção somente para consulta.
              </p>
            </div>
            <div className="flex gap-2">
              {externalUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={externalUrl} target="_blank" rel="noreferrer">
                    <ArrowSquareOut className="h-4 w-4 mr-1.5" />
                    Abrir no Nammux
                  </a>
                </Button>
              )}
              {canManage && (
                <Button variant="outline" size="sm" onClick={syncNow} disabled={syncing}>
                  <ArrowsClockwise className={`h-4 w-4 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
                  {snapshot?.last_error ? "Reprocessar falha" : "Sincronizar novamente"}
                </Button>
              )}
            </div>
          </div>

          {snapshot ? (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Field label="Processo" value={snapshot.process_title || snapshot.external_process_id} />
                <Field label="CNJ" value={snapshot.cnj || "Ainda não distribuído"} mono />
                <Field label="Fase" value={snapshot.stage_name || snapshot.phase || "—"} />
                <Field label="Status" value={snapshot.status_name || "—"} />
                <Field label="Área" value={snapshot.area_name || "—"} />
                <Field label="Responsável" value={snapshot.responsible_name || "Não informado"} />
                <Field label="Contato Nammux" value={snapshot.external_contact_id || "—"} mono />
                <Field
                  label="Última sincronização"
                  value={new Date(snapshot.last_synced_at).toLocaleString("pt-BR")}
                />
              </div>
              {snapshot.last_error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  {snapshot.last_error}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-md border border-dashed p-6 text-center">
              <Clock className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p className="font-medium">Aguardando vínculo com um processo</p>
              <p className="text-sm text-muted-foreground mt-1">
                O vínculo aparece após a oportunidade ganha ser processada pelo Nammux.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-3">Histórico de sincronização</h3>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento de retorno recebido.</p>
          ) : (
            <div className="divide-y">
              {events.map((event) => (
                <div key={event.id} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{event.event_type}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.direction === "inbound" ? "Nammux → Seialz" : "Seialz → Nammux"}
                      {" · "}
                      {new Date(event.occurred_at || event.created_at).toLocaleString("pt-BR")}
                    </p>
                    {event.error && <p className="text-xs text-destructive mt-1">{event.error}</p>}
                  </div>
                  <Badge variant={event.status === "processed" || event.status === "success" ? "default" : "secondary"}>
                    {event.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SyncBadge({ status }: { status: Snapshot["sync_status"] | "pending" }) {
  if (status === "synced") {
    return (
      <Badge className="bg-green-600 text-white">
        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Sincronizado
      </Badge>
    );
  }
  if (status === "error" || status === "conflict") {
    return (
      <Badge variant="destructive">
        <WarningCircle className="h-3.5 w-3.5 mr-1" />
        {status === "conflict" ? "Conflito" : "Erro"}
      </Badge>
    );
  }
  return <Badge variant="secondary">Pendente</Badge>;
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium mt-1 break-words ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

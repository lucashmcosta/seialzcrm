import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  CalendarBlank,
  CaretDown,
  CheckCircle,
  Clock,
  ListBullets,
  MapPin,
  VideoCamera,
  WarningCircle,
} from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import {
  type CompromissoRow,
  type MovimentacaoRow,
  dataSimples,
  faltam,
  linkSeguro,
  modalidadeLabel,
  ondeEsta,
  proximosCompromissos,
  quandoCompromisso,
  tipoCompromisso,
} from "@/lib/nammuxProcessView";

type Snapshot = {
  external_process_id: string;
  external_contact_id: string | null;
  process_title: string | null;
  cnj: string | null;
  internal_number: string | null;
  phase: string | null;
  stage_name: string | null;
  status_code: string | null;
  status_name: string | null;
  status_changed_at: string | null;
  status_change_reason: string | null;
  status_changed_by_name: string | null;
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

// As duas tabelas abaixo ainda não estão no types.ts gerado; a leitura passa
// pela RLS (só a própria organização).
const db = supabase as unknown as SupabaseClient;

const EVENTO_LEGIVEL: Record<string, string> = {
  "process.snapshot.updated": "Situação do processo atualizada",
  "process.agenda.changed": "Agenda do processo atualizada",
  "process.finance.changed": "Financeiro do processo atualizado",
  "process.movement.added": "Nova movimentação",
  "process.sync.failed": "Falha ao criar o processo",
  "classification.certified": "Classificação certificada na entrevista",
  "contact.address.updated": "Endereço do cliente atualizado",
  "opportunity.won": "Negócio ganho enviado",
  "entrevista.agendada": "Entrevista agendada pelo cliente",
  "interview.booking.rejected": "Horário de entrevista recusado",
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
  const [compromissos, setCompromissos] = useState<CompromissoRow[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoRow[]>([]);
  const [appUrl, setAppUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [snapshotResult, eventsResult, integrationResult, agendaResult, movResult] = await Promise.all([
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
      db
        .from("nammux_process_events")
        .select("external_event_id,event_type,subtype,status,start_at,end_at,all_day,timezone,modality,location,virtual_link,removed_at")
        .eq("organization_id", organizationId)
        .eq("opportunity_id", opportunityId)
        .eq("status", "pendente")
        .is("removed_at", null)
        .order("start_at", { ascending: true })
        .limit(50),
      db
        .from("nammux_process_movements")
        .select("external_movement_id,occurred_at,text,tone")
        .eq("organization_id", organizationId)
        .eq("opportunity_id", opportunityId)
        .order("occurred_at", { ascending: false })
        .limit(8),
    ]);
    if (snapshotResult.error) console.error("Nammux snapshot:", snapshotResult.error);
    if (eventsResult.error) console.error("Nammux events:", eventsResult.error);
    // Agenda e movimentações são complemento: se a leitura falhar, a aba segue.
    if (agendaResult.error) console.error("Nammux agenda:", agendaResult.error.message);
    if (movResult.error) console.error("Nammux movimentações:", movResult.error.message);
    const snap = (snapshotResult.data ?? null) as Snapshot | null;
    setSnapshot(snap);
    setEvents((eventsResult.data ?? []) as SyncEvent[]);
    setCompromissos((agendaResult.data ?? []) as CompromissoRow[]);
    setMovimentacoes((movResult.data ?? []) as MovimentacaoRow[]);
    const config = (integrationResult.data?.config_values ?? {}) as Record<string, unknown>;
    setAppUrl(typeof config.app_url === "string" ? config.app_url.replace(/\/+$/, "") : "");
    // Havendo erro, os detalhes já abrem: é ali que está o botão de reprocessar.
    if (snap?.last_error || snap?.sync_status === "error" || snap?.sync_status === "conflict") {
      setDetalhesAbertos(true);
    }
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
  const isPreJudicialCancelled =
    snapshot?.phase === "PRE_JUDICIAL" && snapshot.status_code === "CANCELADO";
  const proximos = useMemo(() => proximosCompromissos(compromissos, new Date()), [compromissos]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("nammux-replay-opportunity", {
        body: { opportunity_id: opportunityId, reason: "opportunity_tab_manual_sync" },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Falha ao sincronizar");
      toast({
        title: "Sincronização enfileirada",
        description: "O processo será atualizado em instantes.",
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
          Carregando o processo…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {isPreJudicialCancelled && snapshot && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <WarningCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-destructive">
                    Processo pré-judicial cancelado
                  </h3>
                  <Badge variant="destructive">Nammux</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  A oportunidade permanece com seu status e sua etapa comercial
                  atuais. Somente a operação pré-judicial no Nammux foi cancelada.
                </p>
                {snapshot.status_change_reason && (
                  <p className="mt-3 text-sm">
                    <span className="font-medium">Motivo:</span>{" "}
                    {snapshot.status_change_reason}
                  </p>
                )}
                {(snapshot.status_changed_by_name || snapshot.status_changed_at) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {snapshot.status_changed_by_name
                      ? `Por ${snapshot.status_changed_by_name}`
                      : "Alterado no Nammux"}
                    {snapshot.status_changed_at
                      ? ` em ${new Date(snapshot.status_changed_at).toLocaleString("pt-BR")}`
                      : ""}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!snapshot ? (
        <Card>
          <CardContent className="pt-6">
            <div className="rounded-md border border-dashed p-6 text-center">
              <Clock className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Este negócio ainda não tem processo no Nammux</p>
              <p className="mt-1 text-sm text-muted-foreground">
                O processo aparece aqui depois que o negócio é ganho e chega ao Nammux.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-5 pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words font-semibold">
                    {snapshot.process_title || "Processo"}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {ondeEsta(snapshot.phase, snapshot.stage_name, snapshot.status_name)}
                  </p>
                </div>
                {externalUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={externalUrl} target="_blank" rel="noreferrer">
                      <ArrowSquareOut className="mr-1.5 h-4 w-4" />
                      Abrir no Nammux
                    </a>
                  </Button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Número do processo" value={snapshot.cnj || "Ainda não distribuído"} mono={!!snapshot.cnj} />
                <Field label="Distribuído em" value={dataSimples(snapshot.distributed_at) || "—"} />
                <Field label="Responsável" value={snapshot.responsible_name || "Não informado"} />
                <Field label="Área" value={snapshot.area_name || "—"} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="mb-3 flex items-center gap-2">
                <CalendarBlank className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold">Próximas datas</h3>
              </div>
              {proximos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma audiência, perícia ou entrevista marcada.
                </p>
              ) : (
                <div className="divide-y">
                  {proximos.map((c) => {
                    const link = linkSeguro(c.virtual_link);
                    const modalidade = modalidadeLabel(c.modality);
                    const prazo = faltam(c, new Date());
                    return (
                      <div key={c.external_event_id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{tipoCompromisso(c.event_type, c.subtype)}</p>
                            {modalidade && <Badge variant="secondary">{modalidade}</Badge>}
                          </div>
                          <p className="mt-1 text-sm">
                            {quandoCompromisso(c)}
                            {prazo && <span className="text-muted-foreground"> · {prazo}</span>}
                          </p>
                          {c.location && (
                            <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span className="break-words">{c.location}</span>
                            </p>
                          )}
                        </div>
                        {link && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={link} target="_blank" rel="noreferrer">
                              <VideoCamera className="mr-1.5 h-4 w-4" />
                              Abrir sala
                            </a>
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="mb-3 flex items-center gap-2">
                <ListBullets className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold">Últimas movimentações</h3>
              </div>
              {movimentacoes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma movimentação relevante registrada até agora.
                </p>
              ) : (
                <div className="divide-y">
                  {movimentacoes.map((m) => (
                    <div key={m.external_movement_id} className="py-3">
                      <p className="text-xs text-muted-foreground">
                        {new Date(m.occurred_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      </p>
                      <p className="mt-1 text-sm">{m.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Collapsible open={detalhesAbertos} onOpenChange={setDetalhesAbertos}>
        <Card>
          <CardContent className="pt-6">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center justify-between gap-3 text-left">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Sincronização com o Nammux</span>
                  <SyncBadge status={snapshot?.sync_status ?? "pending"} />
                </span>
                <CaretDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${detalhesAbertos ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              {snapshot?.last_error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  {snapshot.last_error}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {snapshot
                    ? `Atualizado pela última vez em ${new Date(snapshot.last_synced_at).toLocaleString("pt-BR")}.`
                    : "Ainda sem retorno do Nammux para este negócio."}
                </p>
                {canManage && (
                  <Button variant="outline" size="sm" onClick={syncNow} disabled={syncing}>
                    <ArrowsClockwise className={`mr-1.5 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                    {snapshot?.last_error ? "Reprocessar falha" : "Sincronizar novamente"}
                  </Button>
                )}
              </div>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum evento recebido.</p>
              ) : (
                <div className="divide-y">
                  {events.map((event) => {
                    const ok = event.status === "processed" || event.status === "success";
                    return (
                      <div key={event.id} className="flex items-start justify-between gap-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm">{EVENTO_LEGIVEL[event.event_type] ?? event.event_type}</p>
                          <p className="text-xs text-muted-foreground">
                            {event.direction === "inbound" ? "Do Nammux" : "Para o Nammux"}
                            {" · "}
                            {new Date(event.occurred_at || event.created_at).toLocaleString("pt-BR")}
                          </p>
                          {event.error && <p className="mt-1 text-xs text-destructive">{event.error}</p>}
                        </div>
                        <Badge variant={ok ? "secondary" : "destructive"}>{ok ? "Recebido" : "Com problema"}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>
    </div>
  );
}

function SyncBadge({ status }: { status: Snapshot["sync_status"] | "pending" }) {
  if (status === "synced") {
    return (
      <Badge className="bg-success text-success-foreground">
        <CheckCircle className="mr-1 h-3.5 w-3.5" /> Em dia
      </Badge>
    );
  }
  if (status === "error" || status === "conflict") {
    return (
      <Badge variant="destructive">
        <WarningCircle className="mr-1 h-3.5 w-3.5" />
        {status === "conflict" ? "Conflito" : "Erro"}
      </Badge>
    );
  }
  return <Badge variant="secondary">Aguardando</Badge>;
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 break-words text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

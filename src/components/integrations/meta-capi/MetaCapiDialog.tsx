import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CheckCircle, Plug, Warning, Eye, EyeSlash, ArrowsClockwise, LinkSimple } from "@phosphor-icons/react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: any;
  orgIntegration: any;
}

type EventRow = {
  id: string;
  event_name: string;
  event_time: string;
  status: string;
  contact_id: string | null;
  opportunity_id: string | null;
  meta_error: string | null;
  attempt_count: number;
  created_at: string;
};

const statusBadge = (s: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    sent: { label: "Enviado", cls: "bg-green-600 text-white" },
    pending: { label: "Pendente", cls: "bg-muted text-foreground" },
    retrying: { label: "Em retry", cls: "bg-amber-500 text-white" },
    failed: { label: "Falhou", cls: "bg-destructive text-destructive-foreground" },
    permanent_failure: { label: "Falha permanente", cls: "bg-destructive text-destructive-foreground" },
  };
  const m = map[s] || { label: s, cls: "bg-muted text-foreground" };
  return <Badge className={`text-[10px] ${m.cls}`}>{m.label}</Badge>;
};

export function MetaCapiDialog({ open, onOpenChange, integration, orgIntegration: initialOrgIntegration }: Props) {
  const { organization } = useOrganization();
  const qc = useQueryClient();
  const [tab, setTab] = useState("connection");
  const [filter, setFilter] = useState<string>("all");
  const [showToken, setShowToken] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [reconnectMode, setReconnectMode] = useState(false);

  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ pixel_id?: string; access_token?: string }>({});
  const [mode, setMode] = useState<"reuse" | "manual">("manual");

  const { data: hasMetaLeadAds } = useQuery({
    queryKey: ["has-meta-lead-ads", organization?.id],
    enabled: !!organization?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("organization_integrations")
        .select("id, admin_integrations!inner(slug)")
        .eq("organization_id", organization!.id)
        .eq("admin_integrations.slug", "meta-lead-ads")
        .eq("is_enabled", true)
        .maybeSingle();
      return !!data;
    },
  });

  const { data: orgIntegration } = useQuery({
    queryKey: ["org-integration", "meta-capi", organization?.id],
    enabled: !!organization?.id && !!integration?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("organization_integrations")
        .select("*")
        .eq("organization_id", organization!.id)
        .eq("integration_id", integration!.id)
        .maybeSingle();
      return data;
    },
    initialData: initialOrgIntegration,
  });

  const ca = (orgIntegration?.connected_account || {}) as any;
  const isConnected = !!orgIntegration?.is_enabled;
  const isTestMode = !!ca.test_event_code;

  useEffect(() => {
    if (open) {
      setTab(isConnected ? "events" : "connection");
      setReconnectMode(false);
      setPixelId(ca.pixel_id || "");
      setAccessToken("");
      setTestEventCode(ca.test_event_code || "");
      setErrors({});
    }
  }, [open, isConnected]);

  useEffect(() => {
    if (open && !isConnected) {
      setMode(hasMetaLeadAds ? "reuse" : "manual");
    }
  }, [open, isConnected, hasMetaLeadAds]);

  const { data: events, isLoading: loadingEvents, refetch: refetchEvents } = useQuery({
    queryKey: ["capi_event_log", organization?.id, filter],
    enabled: !!organization?.id && open && isConnected && tab === "events",
    queryFn: async () => {
      let q: any = supabase
        .from("capi_event_log" as any)
        .select("id, event_name, event_time, status, contact_id, opportunity_id, meta_error, attempt_count, created_at")
        .eq("organization_id", organization!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (filter !== "all") q = q.eq("event_name", filter);
      const { data, error } = await q;
      if (error) throw error;
      return data as EventRow[];
    },
  });

  // Stats últimos 7 dias
  const { data: stats } = useQuery({
    queryKey: ["capi_event_stats", organization?.id],
    enabled: !!organization?.id && open && isConnected && tab === "events",
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("capi_event_log" as any)
        .select("status")
        .eq("organization_id", organization!.id)
        .gte("created_at", since);
      if (error) throw error;
      const rows = (data as any[]) || [];
      return {
        total: rows.length,
        sent: rows.filter((r) => r.status === "sent").length,
        failed: rows.filter((r) => r.status === "failed" || r.status === "permanent_failure").length,
        retrying: rows.filter((r) => r.status === "retrying" || r.status === "pending").length,
      };
    },
  });

  const validate = () => {
    const e: any = {};
    if (!/^\d+$/.test(pixelId.trim())) e.pixel_id = "Pixel ID deve conter apenas dígitos.";
    if (accessToken.trim().length < 20) e.access_token = "Token muito curto. Confira se copiou completo.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!organization) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-capi-connect", {
        body: {
          organization_id: organization.id,
          pixel_id: pixelId.trim(),
          access_token: accessToken.trim(),
          test_event_code: testEventCode.trim() || undefined,
        },
      });
      if (error) {
        toast.error(error.message || "Falha ao conectar");
        return;
      }
      if (data?.error) {
        const code = data.meta_error_code;
        if (code === 190) toast.error("Token inválido ou expirado. Gere um novo no Events Manager.");
        else if (code === 100) toast.error("Pixel ID não encontrado. Confira o ID.");
        else toast.error(`Meta rejeitou: ${data.error}`);
        return;
      }
      toast.success("Meta CAPI conectado e validado!");
      qc.invalidateQueries({ queryKey: ["org-integration", "meta-capi"] });
      qc.invalidateQueries({ queryKey: ["organization-integrations"] });
      setReconnectMode(false);
      setTab("events");
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado");
    } finally {
      setSubmitting(false);
    }
  };

  const disconnect = useMutation({
    mutationFn: async () => {
      if (!orgIntegration?.id) return;
      const { error } = await supabase
        .from("organization_integrations")
        .update({ is_enabled: false })
        .eq("id", orgIntegration.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meta CAPI desconectado");
      qc.invalidateQueries({ queryKey: ["org-integration", "meta-capi"] });
      qc.invalidateQueries({ queryKey: ["organization-integrations"] });
      setDisconnectOpen(false);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao desconectar"),
  });

  const reprocess = async (eventId: string) => {
    try {
      const { error } = await supabase.functions.invoke("meta-capi-send-event", {
        body: { capi_event_log_id: eventId },
      });
      if (error) throw error;
      toast.success("Reprocessamento disparado");
      refetchEvents();
    } catch (e: any) {
      toast.error(e.message || "Falha ao reprocessar");
    }
  };

  const sendTest = async () => {
    try {
      const { error } = await supabase.functions.invoke("meta-capi-send-event", {
        body: { organization_id: organization?.id, test: true, event_name: "PageView" },
      });
      if (error) throw error;
      toast.success("Evento de teste enviado. Verifique 'Test events' no Events Manager.");
      refetchEvents();
    } catch (e: any) {
      toast.error(e.message || "Falha no teste");
    }
  };

  const tokenMasked = ca.access_token_last4 ? `••••••••${ca.access_token_last4}` : "••••••••";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-6">
              <div className="flex items-start gap-3">
                {integration?.logo_url ? (
                  <img
                    src={integration.logo_url}
                    alt={integration.name}
                    className="w-12 h-12 rounded-lg object-contain bg-muted p-2"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                    <Plug className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <DialogTitle className="text-xl">Meta Conversions API</DialogTitle>
                  <div className="flex items-center gap-2 mt-1">
                    {isConnected ? (
                      <Badge variant="outline" className="gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        Conectado
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Desconectado</Badge>
                    )}
                    {isTestMode && (
                      <Badge className="bg-amber-500 text-white text-[10px]">
                        Modo teste — eventos não contam
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              {isConnected && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={sendTest}>
                    Testar agora
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDisconnectOpen(true)}>
                    Desconectar
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab} className="mt-4">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="connection">Conexão</TabsTrigger>
              <TabsTrigger value="events" disabled={!isConnected}>
                Eventos enviados
              </TabsTrigger>
            </TabsList>

            <TabsContent value="connection" className="mt-4 space-y-4">
              {isConnected && !reconnectMode ? (
                <Card className="p-4 space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Pixel ID</Label>
                    <p className="font-mono text-sm">{ca.pixel_id || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Access Token</Label>
                    <p className="font-mono text-sm">{tokenMasked}</p>
                  </div>
                  {ca.test_event_code && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Test Event Code</Label>
                      <p className="font-mono text-sm">{ca.test_event_code}</p>
                    </div>
                  )}
                  {ca.validated_at && (
                    <p className="text-xs text-muted-foreground">
                      Validado em{" "}
                      {format(new Date(ca.validated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  )}
                  <div className="pt-2">
                    <Button variant="outline" size="sm" onClick={() => { setReconnectMode(true); setAccessToken(""); }}>
                      <ArrowsClockwise className="h-4 w-4 mr-1" />
                      Reconectar
                    </Button>
                  </div>
                </Card>
              ) : (
                <Card className="p-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pixel_id">Pixel ID *</Label>
                    <Input
                      id="pixel_id"
                      value={pixelId}
                      onChange={(e) => setPixelId(e.target.value)}
                      placeholder="123456789012345"
                      inputMode="numeric"
                    />
                    <p className="text-xs text-muted-foreground">
                      Encontre em Events Manager → Configurações do dataset → ID do dataset
                    </p>
                    {errors.pixel_id && <p className="text-xs text-destructive">{errors.pixel_id}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="access_token">Access Token (CAPI) *</Label>
                    <div className="relative">
                      <Input
                        id="access_token"
                        type={showToken ? "text" : "password"}
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        placeholder="EAAB..."
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                      >
                        {showToken ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Gere em Events Manager → Configurações → Conversions API → Generate access token.
                      Recomendado: System User token (não expira).
                    </p>
                    {errors.access_token && <p className="text-xs text-destructive">{errors.access_token}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="test_event_code">Test Event Code (opcional)</Label>
                    <Input
                      id="test_event_code"
                      value={testEventCode}
                      onChange={(e) => setTestEventCode(e.target.value)}
                      placeholder="TEST12345"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use durante testes pra ver eventos na aba Test events sem afetar atribuição.
                      Deixe vazio em produção.
                    </p>
                    {testEventCode.trim() && (
                      <Badge className="bg-amber-500 text-white text-[10px]">
                        Modo teste — eventos não contam
                      </Badge>
                    )}
                  </div>

                  <Alert>
                    <Warning className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      O token é validado com a Meta antes de salvar e armazenado criptografado server-side.
                    </AlertDescription>
                  </Alert>

                  <div className="flex justify-end gap-2">
                    {isConnected && reconnectMode && (
                      <Button variant="ghost" onClick={() => setReconnectMode(false)}>
                        Cancelar
                      </Button>
                    )}
                    <Button onClick={handleSubmit} disabled={submitting}>
                      {submitting ? "Validando..." : isConnected ? "Reconectar" : "Conectar"}
                    </Button>
                  </div>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="events" className="mt-4 space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-4 gap-3">
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Total (7d)</p>
                  <p className="text-2xl font-semibold">{stats?.total ?? "—"}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Sucesso</p>
                  <p className="text-2xl font-semibold text-green-600">{stats?.sent ?? "—"}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Falhas</p>
                  <p className="text-2xl font-semibold text-destructive">{stats?.failed ?? "—"}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Em retry</p>
                  <p className="text-2xl font-semibold text-amber-600">{stats?.retrying ?? "—"}</p>
                </Card>
              </div>

              {/* Filtro */}
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Filtrar:</Label>
                {["all", "Lead", "Purchase"].map((f) => (
                  <Button
                    key={f}
                    variant={filter === f ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter(f)}
                  >
                    {f === "all" ? "Todos" : f}
                  </Button>
                ))}
                <Button variant="ghost" size="sm" onClick={() => refetchEvents()} className="ml-auto">
                  <ArrowsClockwise className="h-4 w-4" />
                </Button>
              </div>

              {/* Tabela */}
              <Card>
                {loadingEvents ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Carregando...</div>
                ) : !events || events.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Nenhum evento ainda. Eles aparecerão aqui automaticamente quando contatos chegarem via Meta ou oportunidades forem ganhas.
                  </div>
                ) : (
                  <div className="divide-y">
                    {events.map((ev) => (
                      <div key={ev.id} className="p-3 flex items-center gap-3 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{ev.event_name}</span>
                            {statusBadge(ev.status)}
                            {ev.attempt_count > 1 && (
                              <span className="text-[10px] text-muted-foreground">
                                tentativa {ev.attempt_count}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(ev.event_time || ev.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                          </p>
                          {ev.meta_error && (
                            <p className="text-xs text-destructive mt-1 truncate" title={ev.meta_error}>
                              {ev.meta_error}
                            </p>
                          )}
                        </div>
                        {(ev.status === "failed" || ev.status === "retrying") && (
                          <Button variant="outline" size="sm" onClick={() => reprocess(ev.id)}>
                            Reprocessar
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title="Desconectar Meta CAPI"
        description="Os eventos param de ser enviados pra Meta. Você pode reconectar depois usando os mesmos ou novos tokens."
        confirmText="Desconectar"
        variant="destructive"
        onConfirm={() => disconnect.mutate()}
        loading={disconnect.isPending}
      />
    </>
  );
}

import { useState, useEffect, useMemo } from "react";
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

type ConfigField = {
  key: string;
  type: "text" | "password" | "url";
  label: string;
  help?: string;
  required?: boolean;
  group: string;
  placeholder?: string;
};

type ConfigGroup = {
  key: string;
  label: string;
  description?: string;
};

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

const DEFAULT_FIELDS: ConfigField[] = [
  { key: "pixel_id", type: "text", label: "Pixel ID", required: true, group: "connection", placeholder: "123456789012345", help: "Events Manager → Configurações do dataset → ID do dataset" },
  { key: "access_token", type: "password", label: "Access Token (CAPI)", required: true, group: "connection", placeholder: "EAAB...", help: "Events Manager → Configurações → Conversions API → Generate access token. Recomendado: System User token (não expira)." },
  { key: "test_event_code", type: "text", label: "Test Event Code", required: false, group: "connection", placeholder: "TEST12345", help: "Use durante testes. Deixe vazio em produção." },
  { key: "whatsapp_business_account_id", type: "text", label: "WhatsApp Business Account ID", required: false, group: "advanced", placeholder: "1234567890123456", help: "Necessário para CTWA (Click-to-WhatsApp Ads). business.facebook.com/wa/manage/home" },
  { key: "page_id", type: "text", label: "Facebook Page ID", required: false, group: "advanced", placeholder: "1234567890123456", help: "Business Settings → Pages. Melhora atribuição de eventos vindos de Page Inbox." },
  { key: "default_event_source_url", type: "url", label: "URL padrão da Landing Page", required: false, group: "advanced", placeholder: "https://lp.exemplo.com.br/", help: "Usada como fallback no event_source_url quando não vier do contato." },
];

const DEFAULT_GROUPS: ConfigGroup[] = [
  { key: "connection", label: "Conexão", description: "Credenciais obrigatórias para enviar eventos." },
  { key: "advanced", label: "Avançado", description: "Campos opcionais para CTWA e melhor atribuição." },
];

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
  const [innerTab, setInnerTab] = useState("connection");
  const [filter, setFilter] = useState<string>("all");
  const [showToken, setShowToken] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [reconnectMode, setReconnectMode] = useState(false);

  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"reuse" | "manual">("manual");

  const fields: ConfigField[] = useMemo(() => {
    const f = integration?.config_schema?.fields;
    return Array.isArray(f) && f.length > 0 ? (f as ConfigField[]) : DEFAULT_FIELDS;
  }, [integration]);

  const groups: ConfigGroup[] = useMemo(() => {
    const g = integration?.config_schema?.groups;
    return Array.isArray(g) && g.length > 0 ? (g as ConfigGroup[]) : DEFAULT_GROUPS;
  }, [integration]);

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
      setInnerTab("connection");
      setReconnectMode(false);
      setErrors({});
      setShowToken(false);
      if (isConnected) {
        setFormValues({
          pixel_id: ca.pixel_id || "",
          access_token: "",
          test_event_code: ca.test_event_code || "",
          whatsapp_business_account_id: ca.whatsapp_business_account_id || "",
          page_id: ca.page_id || "",
          default_event_source_url: ca.default_event_source_url || "",
        });
      } else {
        setFormValues({});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const setField = (key: string, value: string) =>
    setFormValues((prev) => ({ ...prev, [key]: value }));

  const validate = () => {
    const e: Record<string, string> = {};
    const pid = (formValues.pixel_id || "").trim();
    if (!pid || !/^\d+$/.test(pid)) e.pixel_id = "Pixel ID deve conter apenas dígitos.";

    const tok = (formValues.access_token || "").trim();
    if (mode === "manual" && !isConnected && tok.length < 20) {
      e.access_token = "Token muito curto. Confira se copiou completo.";
    }
    if (reconnectMode && tok.length > 0 && tok.length < 20) {
      e.access_token = "Token muito curto. Confira se copiou completo.";
    }
    // Atualizando integração já conectada sem token novo e sem fallback de Lead Ads
    if (isConnected && !reconnectMode && tok.length === 0 && !hasMetaLeadAds) {
      e.access_token = "Informe o access token para atualizar (ou ative Meta Lead Ads para reusar).";
    }

    const waba = (formValues.whatsapp_business_account_id || "").trim();
    if (waba && !/^\d+$/.test(waba)) e.whatsapp_business_account_id = "WABA ID deve conter apenas dígitos.";

    const pageId = (formValues.page_id || "").trim();
    if (pageId && !/^\d+$/.test(pageId)) e.page_id = "Page ID deve conter apenas dígitos.";

    const url = (formValues.default_event_source_url || "").trim();
    if (url && !/^https?:\/\//.test(url)) e.default_event_source_url = "URL deve começar com http:// ou https://.";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!organization) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      const manualToken = (formValues.access_token || "").trim();
      // Usa from-existing quando: (a) novo connect em modo reuse, OU
      // (b) update sem token novo mas com Meta Lead Ads disponível
      const useReuse =
        (mode === "reuse" && !isConnected) ||
        (isConnected && !reconnectMode && manualToken.length === 0 && !!hasMetaLeadAds);
      const fnName = useReuse ? "meta-capi-connect-from-existing" : "meta-capi-connect";
      const body: any = {
        organization_id: organization.id,
        pixel_id: (formValues.pixel_id || "").trim(),
        test_event_code: (formValues.test_event_code || "").trim() || undefined,
        whatsapp_business_account_id: (formValues.whatsapp_business_account_id || "").trim() || undefined,
        page_id: (formValues.page_id || "").trim() || undefined,
        default_event_source_url: (formValues.default_event_source_url || "").trim() || undefined,
      };
      if (!useReuse && manualToken) {
        body.access_token = manualToken;
      }

      const { data, error } = await supabase.functions.invoke(fnName, { body });
      if (error) {
        toast.error(error.message || "Falha ao conectar");
        return;
      }
      if (data?.error) {
        const code = data.meta_error_code;
        if (code === 190) toast.error("Token inválido ou expirado. Reconecte Meta Lead Ads ou gere um novo no Events Manager.");
        else if (code === 100) toast.error(data.error || "Pixel ID não encontrado. Confira o ID.");
        else toast.error(data.error || "Meta rejeitou a conexão.");
        return;
      }
      toast.success(isConnected ? "Meta CAPI atualizado!" : "Meta CAPI conectado e validado!");
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
      const eventNames = ["PageView", "Lead", "Purchase"] as const;
      const results = await Promise.all(
        eventNames.map(async (event_name) => {
          const { data, error } = await supabase.functions.invoke("meta-capi-send-event", {
            body: { organization_id: organization?.id, test: true, event_name },
          });

          if (error) {
            return { event_name, ok: false, message: error.message || "Falha ao enviar" };
          }

          if (data?.error) {
            return { event_name, ok: false, message: data.error as string };
          }

          return { event_name, ok: true, message: null };
        }),
      );

      const failed = results.filter((result) => !result.ok);

      if (failed.length === eventNames.length) {
        throw new Error(failed.map((result) => `${result.event_name}: ${result.message}`).join(" • "));
      }

      if (failed.length > 0) {
        toast.warning(`Teste parcial: ${failed.map((result) => result.event_name).join(", ")} falharam.`);
      } else {
        toast.success("3 eventos de teste enviados. Verifique 'Test events' no Events Manager.");
      }

      refetchEvents();
    } catch (e: any) {
      toast.error(e.message || "Falha no teste");
    }
  };

  const tokenMasked = ca.access_token_last4 ? `••••••••${ca.access_token_last4}` : "••••••••";

  const configQuality = useMemo(() => {
    const hasCtwaSupport = !!ca.whatsapp_business_account_id || !!ca.page_id;
    const hasUrl = !!ca.default_event_source_url;
    if (hasCtwaSupport && hasUrl) return { label: "Cobertura completa", variant: "default" as const };
    if (hasCtwaSupport || hasUrl) return { label: "Cobertura parcial", variant: "secondary" as const };
    return { label: "Apenas Lead Ads form", variant: "outline" as const };
  }, [ca.whatsapp_business_account_id, ca.page_id, ca.default_event_source_url]);

  const renderField = (field: ConfigField) => {
    const value = formValues[field.key] || "";
    const err = errors[field.key];
    const isPassword = field.type === "password";
    const isManualToken = field.key === "access_token";

    // Em modo reuse (não conectado), esconder access_token
    if (isManualToken && !isConnected && mode === "reuse" && !reconnectMode) return null;

    const requiredLabel = field.required && !(isManualToken && isConnected && !reconnectMode);

    return (
      <div key={field.key} className="space-y-1.5">
        <Label htmlFor={field.key}>
          {field.label} {requiredLabel && "*"}
        </Label>
        <div className="relative">
          <Input
            id={field.key}
            type={isPassword && !showToken ? "password" : "text"}
            value={value}
            onChange={(e) => setField(field.key, e.target.value)}
            placeholder={
              field.placeholder ||
              (isManualToken && isConnected && !reconnectMode ? "Deixe vazio para manter o token atual" : "")
            }
            inputMode={field.type === "text" && /^\d+$/.test(field.placeholder || "") ? "numeric" : undefined}
            className={isPassword ? "pr-10" : undefined}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showToken ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
        {err && <p className="text-xs text-destructive">{err}</p>}
        {field.key === "test_event_code" && (formValues.test_event_code || "").trim() && (
          <Badge className="bg-amber-500 text-white text-[10px]">Modo teste — eventos não contam</Badge>
        )}
      </div>
    );
  };

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
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
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
                    {isConnected && (
                      <Badge variant={configQuality.variant} className="text-[10px]">
                        {configQuality.label}
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
                  {ca.token_source === "meta-lead-ads" && (
                    <Badge variant="outline" className="gap-1 w-fit">
                      <LinkSimple className="h-3 w-3" />
                      Reutilizando token de Meta Lead Ads
                    </Badge>
                  )}
                  {ca.token_source === "meta-lead-ads" && hasMetaLeadAds === false && (
                    <Alert variant="destructive">
                      <Warning className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Meta Lead Ads foi desconectado. Este Meta CAPI usa o token de lá e parou de funcionar. Use "Reconectar" com token manual.
                      </AlertDescription>
                    </Alert>
                  )}
                  {ca.test_event_code && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Test Event Code</Label>
                      <p className="font-mono text-sm">{ca.test_event_code}</p>
                    </div>
                  )}
                  {ca.whatsapp_business_account_id && (
                    <div>
                      <Label className="text-xs text-muted-foreground">WhatsApp Business Account ID</Label>
                      <p className="font-mono text-sm">{ca.whatsapp_business_account_id}</p>
                    </div>
                  )}
                  {ca.page_id && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Facebook Page ID</Label>
                      <p className="font-mono text-sm">{ca.page_id}</p>
                    </div>
                  )}
                  {ca.default_event_source_url && (
                    <div>
                      <Label className="text-xs text-muted-foreground">URL padrão da Landing Page</Label>
                      <p className="font-mono text-sm break-all">{ca.default_event_source_url}</p>
                    </div>
                  )}
                  {ca.validated_at && (
                    <p className="text-xs text-muted-foreground">
                      Validado em{" "}
                      {format(new Date(ca.validated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  )}
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setReconnectMode(true);
                        setInnerTab("connection");
                        setFormValues((prev) => ({ ...prev, access_token: "" }));
                      }}
                    >
                      <ArrowsClockwise className="h-4 w-4 mr-1" />
                      Reconectar / Editar
                    </Button>
                  </div>
                </Card>
              ) : (
                <Card className="p-4 space-y-4">
                  {!isConnected && hasMetaLeadAds && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Modo de conexão</Label>
                      <RadioGroup value={mode} onValueChange={(v) => setMode(v as "reuse" | "manual")} className="gap-2">
                        <div className="flex items-start gap-2 p-3 border rounded-md">
                          <RadioGroupItem value="reuse" id="mode-reuse" className="mt-0.5" />
                          <div className="flex-1">
                            <Label htmlFor="mode-reuse" className="flex items-center gap-2 cursor-pointer">
                              Reusar token Meta Lead Ads
                              <Badge variant="secondary" className="text-[10px]">Recomendado</Badge>
                            </Label>
                            <p className="text-xs text-muted-foreground mt-1">
                              💡 Reusa o System User Token já conectado em Meta Lead Ads. Mais rápido e sem precisar gerar token novo.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 p-3 border rounded-md">
                          <RadioGroupItem value="manual" id="mode-manual" className="mt-0.5" />
                          <div className="flex-1">
                            <Label htmlFor="mode-manual" className="cursor-pointer">
                              Token CAPI manual (avançado)
                            </Label>
                            <p className="text-xs text-muted-foreground mt-1">
                              Cole um access token gerado no Events Manager.
                            </p>
                          </div>
                        </div>
                      </RadioGroup>
                    </div>
                  )}

                  <Tabs value={innerTab} onValueChange={setInnerTab}>
                    <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
                      {groups.map((g) => (
                        <TabsTrigger key={g.key} value={g.key}>
                          {g.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {groups.map((g) => (
                      <TabsContent key={g.key} value={g.key} className="mt-4 space-y-4">
                        {g.description && (
                          <p className="text-xs text-muted-foreground">{g.description}</p>
                        )}
                        {fields.filter((f) => f.group === g.key).map(renderField)}
                      </TabsContent>
                    ))}
                  </Tabs>

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
                      {submitting ? "Validando..." : isConnected ? "Salvar alterações" : "Conectar"}
                    </Button>
                  </div>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="events" className="mt-4 space-y-4">
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

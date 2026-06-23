import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Eye,
  EyeSlash,
  CheckCircle,
  XCircle,
  ArrowsClockwise,
  CaretDown,
  CaretUp,
  PaperPlaneTilt,
  Copy,
  Check,
  Warning,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: any;
  orgIntegration: any;
}

interface NammuxConfig {
  webhook_url: string;
  webhook_secret: string;
  enabled: boolean;
  send_opportunity_won: boolean;
  include_contact_attachments: boolean;
  include_opportunity_attachments: boolean;
  include_document_submissions: boolean;
  nammux_organization_id: string;
}

const defaultConfig: NammuxConfig = {
  webhook_url: "",
  webhook_secret: "",
  enabled: true,
  send_opportunity_won: true,
  include_contact_attachments: true,
  include_opportunity_attachments: true,
  include_document_submissions: true,
  nammux_organization_id: "",
};

const jobStatusBadge = (s: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    success: { label: "Sucesso", cls: "bg-green-600 text-white" },
    pending: { label: "Pendente", cls: "bg-muted text-foreground" },
    running: { label: "Em execução", cls: "bg-blue-600 text-white" },
    retrying: { label: "Em retry", cls: "bg-amber-500 text-white" },
    failed: { label: "Falhou", cls: "bg-destructive text-destructive-foreground" },
    permanent_failure: { label: "Falha permanente", cls: "bg-destructive text-destructive-foreground" },
  };
  const m = map[s] || { label: s, cls: "bg-muted text-foreground" };
  return <Badge className={`text-[10px] ${m.cls}`}>{m.label}</Badge>;
};

export function NammuxDialog({ open, onOpenChange, integration, orgIntegration: initialOrgIntegration }: Props) {
  const { organization } = useOrganization();
  const qc = useQueryClient();

  const [tab, setTab] = useState("config");
  const [showSecret, setShowSecret] = useState(false);
  const [form, setForm] = useState<NammuxConfig>(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    http_status?: number;
    duration_ms?: number;
    error?: string | null;
  } | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [copied, setCopied] = useState<"seialz" | null>(null);

  const copyToClipboard = async (value: string, key: "seialz") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      toast.success("Copiado");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  const { data: orgIntegration } = useQuery({
    queryKey: ["org-integration", "nammux", organization?.id],
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

  const isConnected = !!orgIntegration?.is_enabled;

  useEffect(() => {
    if (open) {
      const cfg = (orgIntegration?.config_values ?? {}) as Partial<NammuxConfig>;
      setForm({
        ...defaultConfig,
        ...cfg,
        webhook_secret: cfg.webhook_secret || "",
      });
      setTab("config");
      setShowSecret(false);
      setTestResult(null);
      setExpandedJobId(null);
    }
  }, [open, orgIntegration?.id]);

  // Jobs (logs)
  const { data: jobs, isLoading: loadingJobs, refetch: refetchJobs } = useQuery({
    queryKey: ["nammux-jobs", organization?.id],
    enabled: !!organization?.id && open && (tab === "logs" || tab === "status"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_jobs")
        .select(
          "id, status, attempts, last_error, started_at, completed_at, created_at, target_action, payload, external_response, idempotency_key",
        )
        .eq("organization_id", organization!.id)
        .eq("integration_slug", "nammux")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  // Stats
  const { data: stats } = useQuery({
    queryKey: ["nammux-stats", organization?.id],
    enabled: !!organization?.id && open && tab === "status",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_jobs")
        .select("status, attempts")
        .eq("organization_id", organization!.id)
        .eq("integration_slug", "nammux")
        .limit(1000);
      if (error) throw error;
      const rows = (data ?? []) as { status: string; attempts: number }[];
      const totalRetries = rows.reduce((s, r) => s + Math.max(0, (r.attempts ?? 1) - 1), 0);
      return {
        total: rows.length,
        success: rows.filter((r) => r.status === "success").length,
        failed: rows.filter((r) => r.status === "failed" || r.status === "permanent_failure").length,
        pending: rows.filter((r) => r.status === "pending" || r.status === "running" || r.status === "retrying").length,
        retries: totalRetries,
      };
    },
  });

  const lastJob = useMemo(() => jobs?.[0], [jobs]);
  const lastSuccess = useMemo(() => jobs?.find((j: any) => j.status === "success"), [jobs]);
  const lastError = useMemo(
    () => jobs?.find((j: any) => j.status === "failed" || j.status === "permanent_failure" || j.last_error),
    [jobs],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organization || !integration) throw new Error("Sem organização");
      const url = form.webhook_url.trim();
      if (form.enabled && url && !/^https?:\/\//i.test(url)) {
        throw new Error("Webhook URL deve começar com http:// ou https://");
      }
      const config_values = {
        webhook_url: url,
        webhook_secret: form.webhook_secret.trim(),
        enabled: form.enabled,
        send_opportunity_won: form.send_opportunity_won,
        include_contact_attachments: form.include_contact_attachments,
        include_opportunity_attachments: form.include_opportunity_attachments,
        include_document_submissions: form.include_document_submissions,
        nammux_organization_id: form.nammux_organization_id.trim(),
      };

      if (orgIntegration?.id) {
        const { error } = await supabase
          .from("organization_integrations")
          .update({
            is_enabled: form.enabled,
            config_values,
            connected_at: orgIntegration.connected_at || new Date().toISOString(),
          } as never)
          .eq("id", orgIntegration.id);
        if (error) throw error;
      } else {
        const { data: authRes } = await supabase.auth.getUser();
        const authUid = authRes?.user?.id;
        let internalUserId: string | null = null;
        if (authUid) {
          const { data: internal } = await supabase
            .from("users")
            .select("id")
            .eq("auth_user_id", authUid)
            .maybeSingle();
          internalUserId = internal?.id ?? null;
        }
        if (!internalUserId) {
          throw new Error("Usuário interno não encontrado para esta conta.");
        }
        const { error } = await supabase.from("organization_integrations").insert({
          organization_id: organization.id,
          integration_id: integration.id,
          is_enabled: form.enabled,
          config_values,
          connected_at: new Date().toISOString(),
          connected_by_user_id: internalUserId,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Configuração salva!");
      qc.invalidateQueries({ queryKey: ["org-integration", "nammux"] });
      qc.invalidateQueries({ queryKey: ["organization-integrations"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      if (!orgIntegration?.id) return;
      const { error } = await supabase
        .from("organization_integrations")
        .update({ is_enabled: false } as never)
        .eq("id", orgIntegration.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nammux desconectado");
      qc.invalidateQueries({ queryKey: ["org-integration", "nammux"] });
      qc.invalidateQueries({ queryKey: ["organization-integrations"] });
      setDisconnectOpen(false);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao desconectar"),
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveMutation.mutateAsync();
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!organization?.id) return;
    setTesting(true);
    setTestResult(null);
    try {
      // Ensure latest config is persisted before testing
      if (saveMutation.isPending) return;
      const { data, error } = await supabase.functions.invoke("nammux-test-connection", {
        body: { organization_id: organization.id },
      });
      if (error) throw error;
      setTestResult(data);
      if (data?.ok) toast.success("✅ Conexão validada");
      else toast.error(`❌ ${data?.error || "Falha no teste"}`);
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message });
      toast.error(e.message || "Falha no teste");
    } finally {
      setTesting(false);
    }
  };

  const prettyJson = (v: unknown) => JSON.stringify(v ?? {}, null, 2);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {integration?.logo_url ? (
                <img
                  src={integration.logo_url}
                  alt={integration.name}
                  className="w-10 h-10 rounded-lg object-contain bg-muted p-1"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-muted" />
              )}
              <div>
                <DialogTitle>Nammux</DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Envia eventos do Seialz para o sistema jurídico Nammux.
                </p>
              </div>
              <div className="ml-auto">
                {isConnected ? (
                  <Badge className="bg-green-600 text-white">Conectado</Badge>
                ) : (
                  <Badge variant="secondary">Desconectado</Badge>
                )}
              </div>
            </div>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab} className="mt-2">
            <TabsList>
              <TabsTrigger value="config">Configuração</TabsTrigger>
              <TabsTrigger value="status">Status</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>

            {/* ───────────────────────── Config ───────────────────────── */}
            <TabsContent value="config" className="space-y-6 mt-4">
              {/* Mapeamento de Organização */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Mapeamento de Organização</h3>
                  {form.nammux_organization_id.trim() ? (
                    <Badge className="bg-green-600 text-white">🟢 Configurado</Badge>
                  ) : (
                    <Badge className="bg-amber-500 text-white">🟠 Não configurado</Badge>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="seialz_org_id" className="text-xs text-muted-foreground">
                    Seialz Organization ID
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="seialz_org_id"
                      value={organization?.id || ""}
                      readOnly
                      className="font-mono text-xs bg-muted"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(organization?.id || "", "seialz")}
                    >
                      {copied === "seialz" ? <Check size={16} /> : <Copy size={16} />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="nammux_org_id">Nammux Organization ID</Label>
                  <Input
                    id="nammux_org_id"
                    value={form.nammux_organization_id}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, nammux_organization_id: e.target.value }))
                    }
                    placeholder="Cole aqui o Organization ID do escritório no Nammux"
                    className="font-mono text-xs"
                  />
                  {!form.nammux_organization_id.trim() && (
                    <Alert className="border-amber-500/50 bg-amber-500/5">
                      <Warning className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-xs">
                        Configure o Nammux Organization ID para concluir o mapeamento entre as
                        organizações.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Geral</h3>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">Ativar integração</p>
                    <p className="text-xs text-muted-foreground">
                      Quando desativada, nenhum evento é enviado ao Nammux.
                    </p>
                  </div>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="webhook_url">Webhook URL *</Label>
                  <Input
                    id="webhook_url"
                    value={form.webhook_url}
                    onChange={(e) => setForm((p) => ({ ...p, webhook_url: e.target.value }))}
                    placeholder="https://nammux.example.com/seialz-webhook-ingest"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="webhook_secret">Webhook Secret *</Label>
                  <div className="relative">
                    <Input
                      id="webhook_secret"
                      type={showSecret ? "text" : "password"}
                      value={form.webhook_secret}
                      onChange={(e) => setForm((p) => ({ ...p, webhook_secret: e.target.value }))}
                      placeholder="Compartilhado com o Nammux para assinar HMAC"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showSecret ? <EyeSlash size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Usado para assinar cada payload com HMAC-SHA256 no header{" "}
                    <code>X-Seialz-Signature</code>.
                  </p>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Eventos</h3>
                <ToggleRow
                  label="Enviar opportunity.won"
                  description="Quando uma oportunidade for marcada como ganha, dispara evento ao Nammux."
                  checked={form.send_opportunity_won}
                  onChange={(v) => setForm((p) => ({ ...p, send_opportunity_won: v }))}
                />
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Documentos</h3>
                <p className="text-xs text-muted-foreground">
                  Opções preparadas para envio futuro de documentos ao Nammux.
                </p>
                <ToggleRow
                  label="Incluir Contact Attachments"
                  description="Anexos vinculados ao contato no payload."
                  checked={form.include_contact_attachments}
                  onChange={(v) => setForm((p) => ({ ...p, include_contact_attachments: v }))}
                />
                <ToggleRow
                  label="Incluir Opportunity Attachments"
                  description="Anexos vinculados à oportunidade no payload."
                  checked={form.include_opportunity_attachments}
                  onChange={(v) => setForm((p) => ({ ...p, include_opportunity_attachments: v }))}
                />
                <ToggleRow
                  label="Incluir Document Submissions aprovados"
                  description="Apenas submissions com status approved."
                  checked={form.include_document_submissions}
                  onChange={(v) => setForm((p) => ({ ...p, include_document_submissions: v }))}
                />
              </section>

              {/* Test connection */}
              {testResult && (
                <Alert
                  className={
                    testResult.ok
                      ? "border-green-500/50 bg-green-500/5"
                      : "border-destructive/50 bg-destructive/5"
                  }
                >
                  {testResult.ok ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <AlertDescription className="text-xs">
                    {testResult.ok ? (
                      <>
                        Conexão validada — HTTP {testResult.http_status} em {testResult.duration_ms}ms
                      </>
                    ) : (
                      <>{testResult.error || "Falha"}</>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-2 justify-end pt-2 border-t">
                {isConnected && (
                  <Button
                    variant="outline"
                    onClick={() => setDisconnectOpen(true)}
                    className="mr-auto"
                  >
                    Desconectar
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={handleTest}
                  disabled={testing || !form.webhook_url || !form.webhook_secret}
                >
                  <PaperPlaneTilt size={16} className="mr-1.5" />
                  {testing ? "Testando..." : "Testar conexão"}
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </TabsContent>

            {/* ───────────────────────── Status ───────────────────────── */}
            <TabsContent value="status" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total" value={stats?.total ?? 0} />
                <StatCard label="Sucesso" value={stats?.success ?? 0} tone="success" />
                <StatCard label="Erros" value={stats?.failed ?? 0} tone="error" />
                <StatCard label="Retries" value={stats?.retries ?? 0} tone="warning" />
              </div>

              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Última atividade</h4>
                  <Button size="sm" variant="ghost" onClick={() => refetchJobs()}>
                    <ArrowsClockwise size={14} className="mr-1" />
                    Atualizar
                  </Button>
                </div>
                <StatusRow label="Último envio" job={lastJob} />
                <StatusRow label="Último sucesso" job={lastSuccess} />
                <StatusRow label="Último erro" job={lastError} errorMode />
              </Card>
            </TabsContent>

            {/* ───────────────────────── Logs ───────────────────────── */}
            <TabsContent value="logs" className="space-y-2 mt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Últimos {jobs?.length ?? 0} eventos enviados.
                </p>
                <Button size="sm" variant="ghost" onClick={() => refetchJobs()}>
                  <ArrowsClockwise size={14} className="mr-1" />
                  Atualizar
                </Button>
              </div>

              {loadingJobs ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
              ) : (jobs?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Nenhum evento enviado ainda.
                </p>
              ) : (
                <div className="border rounded-md divide-y">
                  {jobs!.map((j: any) => {
                    const expanded = expandedJobId === j.id;
                    const ext = (j.external_response ?? {}) as any;
                    return (
                      <div key={j.id} className="p-3 text-xs">
                        <button
                          className="w-full flex items-center gap-3 text-left"
                          onClick={() => setExpandedJobId(expanded ? null : j.id)}
                        >
                          <div className="text-muted-foreground w-32 shrink-0">
                            {format(new Date(j.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                          </div>
                          <div className="flex-1 min-w-0 truncate font-mono">{j.target_action}</div>
                          <div className="shrink-0">{jobStatusBadge(j.status)}</div>
                          <div className="w-12 text-right text-muted-foreground shrink-0">
                            {ext.http_status ?? "—"}
                          </div>
                          <div className="w-16 text-right text-muted-foreground shrink-0">
                            {ext.duration_ms ? `${ext.duration_ms}ms` : "—"}
                          </div>
                          <div className="w-10 text-right text-muted-foreground shrink-0">
                            ×{j.attempts ?? 0}
                          </div>
                          {expanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
                        </button>

                        {expanded && (
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                                Payload
                              </div>
                              <pre className="bg-muted/50 p-2 rounded text-[11px] overflow-auto max-h-64">
                                {prettyJson(j.payload)}
                              </pre>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                                Resposta externa
                              </div>
                              <pre className="bg-muted/50 p-2 rounded text-[11px] overflow-auto max-h-64">
                                {prettyJson(j.external_response)}
                              </pre>
                              {j.last_error && (
                                <p className="mt-2 text-destructive text-[11px]">{j.last_error}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title="Desconectar Nammux"
        description="A integração será desativada e nenhum evento será mais enviado. A configuração permanecerá salva."
        confirmText="Desconectar"
        variant="destructive"
        onConfirm={() => disconnect.mutate()}
        loading={disconnect.isPending}
      />
    </>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div className="min-w-0 pr-3">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "error" | "warning";
}) {
  const toneCls =
    tone === "success"
      ? "text-green-600"
      : tone === "error"
      ? "text-destructive"
      : tone === "warning"
      ? "text-amber-600"
      : "text-foreground";
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${toneCls}`}>{value}</p>
    </Card>
  );
}

function StatusRow({
  label,
  job,
  errorMode,
}: {
  label: string;
  job: any;
  errorMode?: boolean;
}) {
  if (!job) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">—</span>
      </div>
    );
  }
  const when = job.completed_at || job.started_at || job.created_at;
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        {!errorMode && jobStatusBadge(job.status)}
        <span className="text-muted-foreground">
          {format(new Date(when), "dd/MM/yyyy HH:mm", { locale: ptBR })}
        </span>
        {errorMode && job.last_error && (
          <span className="text-destructive truncate max-w-[260px]" title={job.last_error}>
            {job.last_error}
          </span>
        )}
      </div>
    </div>
  );
}

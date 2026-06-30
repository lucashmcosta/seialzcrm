import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CheckCircle, Eye, EyeSlash, ArrowsClockwise, LinkSimple, Plug } from "@phosphor-icons/react";
import {
  MetaWhatsAppValidationError,
  EndpointAlreadyRegisteredError,
  metaWhatsAppService,
} from "@/services/metaWhatsAppService";
import { WhatsAppInboundSettings } from "@/components/settings/WhatsAppInboundSettings";
import { AddMetaWhatsAppNumberDialog } from "./AddMetaWhatsAppNumberDialog";
import { MetaAdditionalEndpointsSection } from "./MetaAdditionalEndpointsSection";
import { MigrateEndpointDialog } from "./MigrateEndpointDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: any;
  orgIntegration: any;
}

const empty = {
  appId: "",
  wabaId: "",
  phoneNumberId: "",
  phoneE164: "",
  systemUserToken: "",
  appSecret: "",
  verifyToken: "",
};

export function MetaWhatsAppCloudDialog({ open, onOpenChange, integration, orgIntegration }: Props) {
  const { organization } = useOrganization();
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const [showToken, setShowToken] = useState(false);
  const [showAppSecret, setShowAppSecret] = useState(false);
  const [showVerifyToken, setShowVerifyToken] = useState(false);
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);
  const [addNumberOpen, setAddNumberOpen] = useState(false);
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [existingEndpointInfo, setExistingEndpointInfo] = useState<{
    endpointId: string;
    provider: string;
    senderSid: string | null;
  } | null>(null);
  const isConnected = !!orgIntegration?.is_enabled;

  // Pré-preenche os campos visíveis a partir do connected_account quando reconectando
  useEffect(() => {
    if (!open) return;
    const ca = (orgIntegration?.connected_account ?? {}) as any;
    const cv = (orgIntegration?.config_values ?? {}) as any;
    setForm({
      appId: ca.app_id ?? cv.app_id ?? "",
      wabaId: ca.waba_id ?? cv.waba_id ?? "",
      phoneNumberId: ca.phone_number_id ?? cv.phone_number_id ?? "",
      phoneE164: cv.phone_e164 ?? "",
      systemUserToken: "",
      appSecret: "",
      verifyToken: "",
    });
  }, [open, orgIntegration]);


  const connectMutation = useMutation({
    mutationFn: async (opts: { skipMetaValidation?: boolean } = {}) => {
      if (!organization?.id) throw new Error("Organização indisponível");
      return await metaWhatsAppService.connect({
        organizationId: organization.id,
        ...form,
        skipMetaValidation: opts.skipMetaValidation,
      });
    },
    onSuccess: (_data, vars) => {
      toast.success(vars?.skipMetaValidation ? "Dados salvos (sem validação Meta)" : "Meta WhatsApp Cloud conectado!");
      qc.invalidateQueries({ queryKey: ["organization-integrations"] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      if (e instanceof MetaWhatsAppValidationError) {
        toast.error("A Meta recusou a validação", {
          description: "Se você só quer trocar número/ID agora, use Salvar sem validar.",
        });
        return;
      }
      if (e instanceof EndpointAlreadyRegisteredError) {
        setExistingEndpointInfo({
          endpointId: e.info.existing_endpoint_id,
          provider: e.info.existing_provider,
          senderSid: e.info.existing_sender_sid,
        });
        setMigrateOpen(true);
        toast.message("Número já existe nesta organização", {
          description: `Provider atual: ${e.info.existing_provider}. Use o diálogo de migração para trocar o provider preservando o histórico.`,
        });
        return;
      }
      toast.error(`Falha ao salvar: ${e?.message ?? e}`);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("Organização indisponível");
      return await metaWhatsAppService.verify(organization.id);
    },
    onSuccess: () => {
      toast.success("Verificação concluída");
      qc.invalidateQueries({ queryKey: ["organization-integrations"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e?.message ?? e}`),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("Organização indisponível");
      await metaWhatsAppService.disconnect(organization.id);
    },
    onSuccess: () => {
      toast.success("Integração desconectada");
      qc.invalidateQueries({ queryKey: ["organization-integrations"] });
      setConfirmDisconnectOpen(false);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(`Erro: ${e?.message ?? e}`),
  });

  const templatesQuery = useQuery({
    queryKey: ["meta-wa-templates", organization?.id, orgIntegration?.id],
    enabled: !!organization?.id && !!orgIntegration?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("id, friendly_name, language, category, status, last_synced_at")
        .eq("organization_id", organization!.id)
        .eq("organization_integration_id", orgIntegration!.id)
        .eq("provider", "meta_cloud_api")
        .order("friendly_name");
      if (error) throw error;
      return data || [];
    },
  });

  const syncTemplatesMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("Organização indisponível");
      return await metaWhatsAppService.syncTemplates(organization.id);
    },
    onSuccess: (data) => {
      toast.success(`Templates sincronizados: ${data.synced}/${data.total} (${data.approved} aprovados)`);
      templatesQuery.refetch();
    },
    onError: (e: any) => toast.error(`Falha ao sincronizar: ${e?.message ?? e}`),
  });

  const ca = (orgIntegration?.connected_account ?? {}) as any;
  const cv = (orgIntegration?.config_values ?? {}) as any;
  const hasStoredAppSecret = !!ca.app_secret_encrypted;
  const hasStoredVerifyToken = !!ca.verify_token_encrypted;

  // Em nova conexão, App Secret + Verify Token + System User Token são obrigatórios.
  // Ao editar uma já conectada, deixar em branco mantém o valor anterior.
  const canSubmit =
    !!form.appId &&
    !!form.wabaId &&
    !!form.phoneNumberId &&
    /^\+\d{8,15}$/.test(form.phoneE164) &&
    (isConnected || !!form.systemUserToken) &&
    (isConnected || hasStoredAppSecret || !!form.appSecret) &&
    (isConnected || hasStoredVerifyToken || !!form.verifyToken);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5" />
              {integration?.name ?? "Meta WhatsApp Cloud"}
            </DialogTitle>
            <DialogDescription>
              Cada organização usa o próprio App Meta. Preencha todos os campos abaixo com os dados do App
              da sua conta Meta (App ID, App Secret, Verify Token, WABA ID, Phone Number ID, número E.164
              e System User Token permanente).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* ===== Painel quando já conectado ===== */}
            {isConnected && (
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Número conectado
                  </h4>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => verifyMutation.mutate()}
                      disabled={verifyMutation.isPending}
                    >
                      <ArrowsClockwise className="h-4 w-4 mr-1" />
                      {verifyMutation.isPending ? "Verificando..." : "Verificar"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmDisconnectOpen(true)}
                    >
                      Desconectar
                    </Button>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="Número" value={cv.display_phone_number ?? cv.phone_e164} />
                  <Field label="Nome verificado" value={cv.verified_name} />
                  <Field label="WABA ID" value={cv.waba_id} mono />
                  <Field label="Phone Number ID" value={cv.phone_number_id} mono />
                  <Field label="App ID" value={cv.app_id} mono />
                  <Field label="Qualidade" value={cv.quality_rating} />
                  <Field label="Tier de envio" value={cv.messaging_limit_tier} />
                  <Field
                    label="Última validação"
                    value={cv.last_validated_at ? new Date(cv.last_validated_at).toLocaleString("pt-BR") : "—"}
                  />
                </div>
              </Card>
            )}

            {/* ===== Números adicionais da WABA ===== */}
            {isConnected && organization?.id && orgIntegration?.id && (
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="font-medium">Outros números desta WABA</h4>
                    <p className="text-xs text-muted-foreground">
                      Mesma WABA, App e tokens da integração principal. Use para roteamento por finalidade
                      (Atendimento vs Comercial).
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAddNumberOpen(true)}
                    disabled={!cv.waba_id || !cv.app_id}
                    title={!cv.waba_id ? "Conecte a integração principal primeiro" : ""}
                  >
                    + Adicionar número desta WABA
                  </Button>
                </div>
                <Separator />
                <MetaAdditionalEndpointsSection
                  organizationId={organization.id}
                  organizationIntegrationId={orgIntegration.id}
                  primaryPhoneNumberId={ca.phone_number_id ?? cv.phone_number_id ?? null}
                />
              </Card>
            )}



            {/* ===== Templates ===== */}
            {isConnected && (
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="font-medium">Templates aprovados</h4>
                    <p className="text-xs text-muted-foreground">
                      Templates da Meta usados para enviar fora da janela de 24h.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncTemplatesMutation.mutate()}
                    disabled={syncTemplatesMutation.isPending}
                  >
                    <ArrowsClockwise className="h-4 w-4 mr-1" />
                    {syncTemplatesMutation.isPending ? "Sincronizando..." : "Sincronizar templates"}
                  </Button>
                </div>
                <Separator />
                {templatesQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Carregando…</p>
                ) : !templatesQuery.data || templatesQuery.data.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum template sincronizado ainda. Clique em <strong>Sincronizar templates</strong> para
                    buscar na Meta.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {templatesQuery.data.map((t: any) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between text-sm px-2 py-1.5 rounded border border-border"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{t.friendly_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.language} · {t.category ?? "—"}
                          </p>
                        </div>
                        <Badge
                          variant={
                            t.status === "approved"
                              ? "default"
                              : t.status === "rejected"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {t.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Total: {templatesQuery.data?.length ?? 0} · Aprovados:{" "}
                  {templatesQuery.data?.filter((t: any) => t.status === "approved").length ?? 0}
                </p>
              </Card>
            )}

            {/* ===== Regras de Entrada ===== */}
            {isConnected && orgIntegration?.id && (
              <Card className="p-4">
                <WhatsAppInboundSettings integrationId={orgIntegration.id} />
              </Card>
            )}






            {/* ===== Form de conexão / edição ===== */}
            <Card className="p-4 space-y-4">
              <h4 className="font-medium">
                {isConnected ? "Editar dados do número" : "Dados do número (organização)"}
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="meta-app-id">App ID</Label>
                  <Input
                    id="meta-app-id"
                    value={form.appId}
                    placeholder="1234567890123456"
                    onChange={(e) => setForm((f) => ({ ...f, appId: e.target.value.trim() }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meta-waba-id">WABA ID</Label>
                  <Input
                    id="meta-waba-id"
                    value={form.wabaId}
                    placeholder="9876543210987654"
                    onChange={(e) => setForm((f) => ({ ...f, wabaId: e.target.value.trim() }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meta-phone-id">Phone Number ID</Label>
                  <Input
                    id="meta-phone-id"
                    value={form.phoneNumberId}
                    placeholder="1122334455667788"
                    onChange={(e) => setForm((f) => ({ ...f, phoneNumberId: e.target.value.trim() }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meta-phone-e164">Número (E.164)</Label>
                  <Input
                    id="meta-phone-e164"
                    value={form.phoneE164}
                    placeholder="+5511999999999"
                    onChange={(e) => setForm((f) => ({ ...f, phoneE164: e.target.value.trim() }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="meta-token">System User Token (permanente)</Label>
                <div className="relative">
                  <Input
                    id="meta-token"
                    type={showToken ? "text" : "password"}
                    value={form.systemUserToken}
                    placeholder="EAAB..."
                    onChange={(e) => setForm((f) => ({ ...f, systemUserToken: e.target.value }))}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Será criptografado antes de salvar. Não trafega de volta ao navegador.
                  {isConnected && " Cole o token novamente para atualizar — ele não é exibido de volta."}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="meta-app-secret">
                  App Secret
                  {hasStoredAppSecret ? (
                    <span className="ml-2 text-xs text-green-600 font-normal">••• já configurado</span>
                  ) : (
                    <span className="ml-1 text-destructive">*</span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    id="meta-app-secret"
                    type={showAppSecret ? "text" : "password"}
                    value={form.appSecret}
                    placeholder={hasStoredAppSecret ? "Deixe em branco para manter" : "App Secret do app Meta"}
                    onChange={(e) => setForm((f) => ({ ...f, appSecret: e.target.value }))}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAppSecret((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showAppSecret ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Usado para calcular appsecret_proof nas chamadas Graph e validar a assinatura dos webhooks.
                  Criptografado antes de salvar.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="meta-verify-token">
                  Verify Token
                  {hasStoredVerifyToken ? (
                    <span className="ml-2 text-xs text-green-600 font-normal">••• já configurado</span>
                  ) : (
                    <span className="ml-1 text-destructive">*</span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    id="meta-verify-token"
                    type={showVerifyToken ? "text" : "password"}
                    value={form.verifyToken}
                    placeholder={hasStoredVerifyToken ? "Deixe em branco para manter" : "Token escolhido por você"}
                    onChange={(e) => setForm((f) => ({ ...f, verifyToken: e.target.value }))}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowVerifyToken((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showVerifyToken ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Mesmo valor cadastrado no Webhook do app Meta (campo "Verify token"). Criptografado antes de salvar.
                </p>
              </div>

              <div className="flex justify-between items-center pt-1 gap-2 flex-wrap">
                <a
                  href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                  target="_blank" rel="noreferrer"
                  className="text-xs text-primary inline-flex items-center gap-1"
                >
                  <LinkSimple className="h-3 w-3" /> Documentação Meta Cloud
                </a>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => connectMutation.mutate({})}
                    disabled={!canSubmit || connectMutation.isPending}
                    title="Confere os dados na Graph API da Meta antes de salvar."
                  >
                    {connectMutation.isPending ? "Validando..." : "Validar na Meta"}
                  </Button>
                  <Button
                    onClick={() => connectMutation.mutate({ skipMetaValidation: true })}
                    disabled={!canSubmit || connectMutation.isPending}
                    title="Salva os dados sem chamar a Graph API da Meta. Use quando souber que os IDs estão corretos mas a Meta está recusando."
                  >
                    {connectMutation.isPending ? "Salvando..." : "Salvar sem validar"}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDisconnectOpen}
        onOpenChange={setConfirmDisconnectOpen}
        title="Desconectar Meta WhatsApp Cloud"
        description="O número será desativado para envio e recebimento. Configurações Twilio e demais integrações Meta não são afetadas."
        confirmText="Desconectar"
        variant="destructive"
        onConfirm={() => disconnectMutation.mutate()}
        loading={disconnectMutation.isPending}
      />

      {organization?.id && cv.waba_id && cv.app_id && (
        <AddMetaWhatsAppNumberDialog
          open={addNumberOpen}
          onOpenChange={setAddNumberOpen}
          organizationId={organization.id}
          wabaId={cv.waba_id}
          appId={cv.app_id}
        />
      )}

      {organization?.id && existingEndpointInfo && (
        <MigrateEndpointDialog
          open={migrateOpen}
          onOpenChange={setMigrateOpen}
          existing={existingEndpointInfo}
          payload={{
            organizationId: organization.id,
            wabaId: form.wabaId,
            phoneNumberId: form.phoneNumberId,
            phoneE164: form.phoneE164,
            appId: form.appId || undefined,
            systemUserToken: form.systemUserToken || undefined,
            appSecret: form.appSecret || undefined,
            verifyToken: form.verifyToken || undefined,
            endpointPurpose: undefined,
            displayName: undefined,
            migrationReason: "provider_swap",
          }}
          onMigrated={() => {
            qc.invalidateQueries({ queryKey: ["organization-integrations"] });
            setExistingEndpointInfo(null);
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}

function Field({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono text-xs break-all" : "text-sm"}>{value ?? "—"}</p>
    </div>
  );
}


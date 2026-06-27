import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CheckCircle, Warning, Eye, EyeSlash, ArrowsClockwise, LinkSimple, Plug } from "@phosphor-icons/react";
import { MetaWhatsAppValidationError, metaWhatsAppService } from "@/services/metaWhatsAppService";

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
    });
  }, [open, orgIntegration]);

  const platformQuery = useQuery({
    queryKey: ["meta-wa-platform-status"],
    queryFn: () => metaWhatsAppService.getPlatformStatus(),
    enabled: open,
    staleTime: 30_000,
  });

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

  const canSubmit =
    !!form.appId &&
    !!form.wabaId &&
    !!form.phoneNumberId &&
    /^\+\d{8,15}$/.test(form.phoneE164) &&
    !!form.systemUserToken;

  const platform = platformQuery.data;
  const ca = (orgIntegration?.connected_account ?? {}) as any;
  const cv = (orgIntegration?.config_values ?? {}) as any;

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
              Conecte seu número WhatsApp Business diretamente pela API oficial da Meta (Cloud API).
              MVP: envio e recebimento de texto dentro da janela 24h.
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

            {/* ===== Status da plataforma ===== */}
            <Card className="p-4 space-y-3">
              <h4 className="font-medium">Status da plataforma</h4>
              {platformQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando status…</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <StatusRow label="App Secret global" ok={!!platform?.appSecretConfigured} />
                  <StatusRow label="Verify Token global" ok={!!platform?.verifyTokenConfigured} />
                  <StatusRow label="Webhook" ok={!!platform?.webhookActive} okLabel="Ativo" pendingLabel="Pendente de configuração global" />
                </div>
              )}
              {platform && !platform.webhookActive && (
                <Alert>
                  <Warning className="h-4 w-4" />
                  <AlertDescription>
                    Configuração global da Meta WhatsApp Cloud pendente. O envio pode ser configurado,
                    mas o recebimento de mensagens e callbacks só serão ativados após a configuração
                    global da plataforma (área administrativa Seialz).
                  </AlertDescription>
                </Alert>
              )}
            </Card>

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

function StatusRow({
  label, ok, okLabel = "Configurado", pendingLabel = "Pendente",
}: { label: string; ok: boolean; okLabel?: string; pendingLabel?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      {ok
        ? <Badge className="bg-green-600 text-white">{okLabel}</Badge>
        : <Badge variant="outline" className="border-amber-500 text-amber-600">{pendingLabel}</Badge>}
    </div>
  );
}

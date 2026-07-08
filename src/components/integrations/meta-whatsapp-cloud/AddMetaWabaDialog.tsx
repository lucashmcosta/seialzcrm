// PR1-B: Adiciona uma nova WABA à organização, reutilizando as credenciais
// Meta compartilhadas (meta_app_credentials, populadas no M2).
// NÃO pede app_id/token/app_secret — apenas dados específicos da WABA.
// Requer M3 (drop do unique legado) para inserir a 2ª WABA da organização.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowsClockwise, Warning } from "@phosphor-icons/react";
import {
  EndpointAlreadyRegisteredError,
  MetaWhatsAppValidationError,
  UniqueConstraintBlockedError,
  WabaAlreadyRegisteredError,
  metaWhatsAppService,
} from "@/services/metaWhatsAppService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}

type Purpose = "customer_service" | "commercial" | "vendor_personal" | "other";

export function AddMetaWabaDialog({ open, onOpenChange, organizationId }: Props) {
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [purpose, setPurpose] = useState<Purpose>("customer_service");

  const reset = () => {
    setDisplayName("");
    setWabaId("");
    setPhoneNumberId("");
    setPhoneE164("");
    setPurpose("customer_service");
  };

  const addWaba = useMutation({
    mutationFn: (opts: { skipMetaValidation?: boolean }) =>
      metaWhatsAppService.addWaba({
        organizationId,
        wabaId: wabaId.trim(),
        phoneNumberId: phoneNumberId.trim(),
        phoneE164: phoneE164.trim(),
        displayName: displayName.trim(),
        endpointPurpose: purpose,
        skipMetaValidation: opts.skipMetaValidation,
      }),
    onSuccess: (r) => {
      toast.success(`WABA "${r.display_name}" adicionada`, {
        description: `Endpoint criado para ${r.meta.display_phone_number}.`,
      });
      qc.invalidateQueries({ queryKey: ["meta-wabas", organizationId] });
      qc.invalidateQueries({ queryKey: ["organization-integrations"] });
      qc.invalidateQueries({ queryKey: ["org-whatsapp-endpoints"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      if (e instanceof UniqueConstraintBlockedError) {
        toast.error("Bloqueado pelo unique legado", {
          description: "Backend pronto. Rode M3 (remoção do unique) para habilitar a 2ª WABA.",
        });
        return;
      }
      if (e instanceof WabaAlreadyRegisteredError) {
        toast.error("WABA já cadastrada", {
          description: e.info.existing_display_name
            ? `Já existe como "${e.info.existing_display_name}".`
            : undefined,
        });
        return;
      }
      if (e instanceof EndpointAlreadyRegisteredError) {
        toast.error("Este número já existe nesta organização", {
          description: `Provider atual: ${e.info.existing_provider}.`,
        });
        return;
      }
      if (e instanceof MetaWhatsAppValidationError) {
        toast.error("A Meta recusou a validação", {
          description: "Confira waba_id e phone_number_id. Se necessário, use 'Salvar sem validar'.",
        });
        return;
      }
      const msg = (e as Error)?.message ?? String(e);
      if (msg === "credentials_not_found") {
        toast.error("Sem credenciais Meta para a organização", {
          description: "Conecte a integração Meta principal antes de adicionar uma WABA.",
        });
        return;
      }
      toast.error(`Falha ao adicionar WABA: ${msg}`);
    },
  });

  const canSubmit =
    !!displayName.trim() &&
    !!wabaId.trim() &&
    !!phoneNumberId.trim() &&
    /^\+\d{8,15}$/.test(phoneE164.trim()) &&
    !addWaba.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar nova WABA</DialogTitle>
          <DialogDescription>
            Cria uma nova conta WhatsApp Business (WABA) na mesma organização, reutilizando o App e
            os tokens Meta já cadastrados. Você só precisa informar o WABA ID e o primeiro número.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-900 dark:text-yellow-200 flex gap-2">
          <Warning className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Feature em fase controlada. Enquanto a migração <code>M3</code> não for aplicada, o
            unique legado <code>(organization_id, integration_id)</code> impede o registro da 2ª
            WABA e o envio retorna <code>unique_constraint_blocked</code>.
          </span>
        </div>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="waba-display-name">Nome interno *</Label>
            <Input
              id="waba-display-name"
              value={displayName}
              placeholder="Ex.: WABA Comercial BR"
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="waba-id">WABA ID *</Label>
            <Input
              id="waba-id"
              value={wabaId}
              placeholder="1234567890123456"
              onChange={(e) => setWabaId(e.target.value.trim())}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="waba-phone-id">Phone Number ID *</Label>
              <Input
                id="waba-phone-id"
                value={phoneNumberId}
                placeholder="1122334455667788"
                onChange={(e) => setPhoneNumberId(e.target.value.trim())}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="waba-phone-e164">Número (E.164) *</Label>
              <Input
                id="waba-phone-e164"
                value={phoneE164}
                placeholder="+5511999999999"
                onChange={(e) => setPhoneE164(e.target.value.trim())}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Finalidade do primeiro número *</Label>
            <RadioGroup
              value={purpose}
              onValueChange={(v) => setPurpose(v as Purpose)}
              className="grid grid-cols-2 gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="customer_service" id="waba-p-cs" />
                <Label htmlFor="waba-p-cs" className="font-normal cursor-pointer">
                  Atendimento (/inbox)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="commercial" id="waba-p-com" />
                <Label htmlFor="waba-p-com" className="font-normal cursor-pointer">
                  Comercial (/messages)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="vendor_personal" id="waba-p-vp" />
                <Label htmlFor="waba-p-vp" className="font-normal cursor-pointer">
                  Pessoal (/messages)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="other" id="waba-p-o" />
                <Label htmlFor="waba-p-o" className="font-normal cursor-pointer">
                  Outro
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={addWaba.isPending}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => addWaba.mutate({ skipMetaValidation: true })}
            disabled={!canSubmit}
            title="Salva sem chamar a Graph API."
          >
            Salvar sem validar
          </Button>
          <Button onClick={() => addWaba.mutate({})} disabled={!canSubmit}>
            {addWaba.isPending && <ArrowsClockwise className="h-4 w-4 mr-2 animate-spin" />}
            Validar na Meta e adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

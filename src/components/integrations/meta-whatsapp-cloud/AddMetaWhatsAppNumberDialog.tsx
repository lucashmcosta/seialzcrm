// Adiciona um endpoint adicional na MESMA WABA já conectada.
// NÃO altera a integração existente nem o endpoint "principal".
// Reaproveita o systemUserToken/appSecret/verifyToken já cifrados na integração.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { MetaWhatsAppValidationError, metaWhatsAppService } from "@/services/metaWhatsAppService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  /** Dados da integração já conectada (WABA-level), usados como contexto read-only. */
  wabaId: string;
  appId: string;
}

type Purpose = "customer_service" | "commercial";

export function AddMetaWhatsAppNumberDialog({
  open,
  onOpenChange,
  organizationId,
  wabaId,
  appId,
}: Props) {
  const qc = useQueryClient();
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [purpose, setPurpose] = useState<Purpose>("customer_service");

  const reset = () => {
    setPhoneNumberId("");
    setPhoneE164("");
    setDisplayName("");
    setPurpose("customer_service");
  };

  const addMutation = useMutation({
    mutationFn: async (opts: { skipMetaValidation?: boolean }) => {
      return await metaWhatsAppService.connect({
        organizationId,
        appId,
        wabaId,
        phoneNumberId: phoneNumberId.trim(),
        phoneE164: phoneE164.trim(),
        // mode='additional' reaproveita os tokens já cifrados na integração
        systemUserToken: "",
        mode: "additional",
        endpointPurpose: purpose,
        displayName: displayName.trim() || undefined,
        skipMetaValidation: opts.skipMetaValidation,
      });
    },
    onSuccess: () => {
      toast.success("Novo número Meta adicionado");
      qc.invalidateQueries({ queryKey: ["meta-additional-endpoints", organizationId] });
      qc.invalidateQueries({ queryKey: ["organization-integrations"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: any) => {
      if (e instanceof MetaWhatsAppValidationError) {
        toast.error("A Meta recusou a validação", {
          description: "Confira phone_number_id e WABA. Se necessário, use 'Salvar sem validar'.",
        });
        return;
      }
      const msg: string = e?.message ?? String(e);
      if (msg.includes("waba_mismatch")) {
        toast.error("WABA divergente — número precisa pertencer à mesma WABA da integração.");
        return;
      }
      if (msg.includes("integration_not_connected")) {
        toast.error("Conecte a integração principal antes de adicionar números.");
        return;
      }
      toast.error(`Falha ao adicionar: ${msg}`);
    },
  });

  const canSubmit =
    !!phoneNumberId.trim() &&
    /^\+\d{8,15}$/.test(phoneE164.trim()) &&
    !addMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar número desta WABA</DialogTitle>
          <DialogDescription>
            Cadastra um novo endpoint Meta Cloud reutilizando o App e a WABA já conectados.
            O token e segredos da integração principal são reaproveitados — não precisa colá-los de novo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <Label className="text-muted-foreground text-[11px]">WABA ID (reutilizado)</Label>
              <p className="font-mono break-all">{wabaId}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-[11px]">App ID (reutilizado)</Label>
              <p className="font-mono break-all">{appId}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-meta-phone-id">Phone Number ID *</Label>
            <Input
              id="add-meta-phone-id"
              value={phoneNumberId}
              placeholder="1122334455667788"
              onChange={(e) => setPhoneNumberId(e.target.value.trim())}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-meta-phone-e164">Número (E.164) *</Label>
            <Input
              id="add-meta-phone-e164"
              value={phoneE164}
              placeholder="+5511999999999"
              onChange={(e) => setPhoneE164(e.target.value.trim())}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-meta-display-name">Apelido (opcional)</Label>
            <Input
              id="add-meta-display-name"
              value={displayName}
              placeholder="Ex.: Atendimento SP"
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label>Finalidade *</Label>
            <RadioGroup
              value={purpose}
              onValueChange={(v) => setPurpose(v as Purpose)}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="customer_service" id="purpose-cs" />
                <Label htmlFor="purpose-cs" className="font-normal cursor-pointer">
                  Atendimento / CS (/inbox)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="commercial" id="purpose-commercial" />
                <Label htmlFor="purpose-commercial" className="font-normal cursor-pointer">
                  Comercial (/messages)
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={addMutation.isPending}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => addMutation.mutate({ skipMetaValidation: true })}
            disabled={!canSubmit}
            title="Salva sem chamar a Graph API da Meta."
          >
            Salvar sem validar
          </Button>
          <Button
            onClick={() => addMutation.mutate({})}
            disabled={!canSubmit}
          >
            {addMutation.isPending && <ArrowsClockwise className="h-4 w-4 mr-2 animate-spin" />}
            Validar na Meta e adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Sub-diálogo de "Migrar número existente para Meta Cloud".
// Disparado quando o connect retorna 409 endpoint_address_already_registered.
// Permite simular (dry-run) e aplicar a migração in-place do endpoint existente.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  metaWhatsAppService,
  type MigrateInput,
  type MigrateResult,
} from "@/services/metaWhatsAppService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dados detectados do endpoint Twilio (ou outro) que ocupa o E.164. */
  existing: {
    endpointId: string;
    provider: string;
    senderSid: string | null;
  } | null;
  /** Dados Meta já digitados no form principal — base do payload da migração. */
  payload: Omit<MigrateInput, "existingEndpointId">;
  onMigrated: () => void;
}

export function MigrateEndpointDialog({
  open,
  onOpenChange,
  existing,
  payload,
  onMigrated,
}: Props) {
  const [dryRun, setDryRun] = useState<MigrateResult | null>(null);

  const buildInput = (): MigrateInput | null => {
    if (!existing) return null;
    return { ...payload, existingEndpointId: existing.endpointId, provider: "meta_cloud_api" };
  };

  const dryRunMutation = useMutation({
    mutationFn: async () => {
      const input = buildInput();
      if (!input) throw new Error("missing_existing_endpoint");
      return await metaWhatsAppService.migrateDryRun(input);
    },
    onSuccess: (data) => {
      setDryRun(data);
      toast.success("Simulação concluída — nenhum dado foi alterado.");
    },
    onError: (e: any) => toast.error(`Falha na simulação: ${e?.message ?? e}`),
  });

  const migrateMutation = useMutation({
    mutationFn: async () => {
      const input = buildInput();
      if (!input) throw new Error("missing_existing_endpoint");
      return await metaWhatsAppService.migrate(input);
    },
    onSuccess: () => {
      toast.success("Endpoint migrado para Meta Cloud com sucesso.");
      setDryRun(null);
      onOpenChange(false);
      onMigrated();
    },
    onError: (e: any) => toast.error(`Falha ao migrar: ${e?.message ?? e}`),
  });

  const busy = dryRunMutation.isPending || migrateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { setDryRun(null); onOpenChange(o); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Migrar número existente para Meta Cloud</DialogTitle>
          <DialogDescription>
            Este número já existe nesta organização como endpoint do provider{" "}
            <strong>{existing?.provider ?? "—"}</strong>. A migração troca o provider para Meta Cloud
            <strong> preservando a mesma identidade do endpoint</strong> (mesmo ID, mesmas threads,
            mesmas mensagens, mesmos contatos). Uma nota de sistema aparecerá automaticamente em cada
            conversa na primeira resposta enviada após a migração.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border p-3 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Endpoint existente</span>
              <Badge variant="secondary">{existing?.provider ?? "—"}</Badge>
            </div>
            <div className="font-mono text-xs break-all">{existing?.endpointId ?? "—"}</div>
            <div className="text-xs text-muted-foreground">
              Sender SID atual: <span className="font-mono">{existing?.senderSid ?? "—"}</span>
            </div>
          </div>

          <div className="rounded-md border border-border p-3 text-sm space-y-1">
            <p className="text-muted-foreground">Destino Meta Cloud</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">WABA ID</span>
                <p className="font-mono break-all">{payload.wabaId}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Phone Number ID</span>
                <p className="font-mono break-all">{payload.phoneNumberId}</p>
              </div>
              <div>
                <span className="text-muted-foreground">E.164</span>
                <p className="font-mono">{payload.phoneE164}</p>
              </div>
            </div>
          </div>

          {dryRun && (
            <div className="rounded-md border border-border p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">Diff da simulação</p>
                <Badge variant="outline">dry-run</Badge>
              </div>
              <Separator />
              <DiffRow
                label="provider"
                before={(dryRun.before as any).provider}
                after={(dryRun.after as any).provider}
              />
              <DiffRow
                label="sender_sid"
                before={(dryRun.before as any).sender_sid}
                after={(dryRun.after as any).sender_sid}
              />
              <DiffRow
                label="organization_integration_id"
                before={(dryRun.before as any).organization_integration_id}
                after={(dryRun.after as any).organization_integration_id}
              />
              <DiffRow
                label="external_account_id"
                before={(dryRun.before as any).external_account_id}
                after={(dryRun.after as any).external_account_id}
              />
              <DiffRow
                label="status"
                before={(dryRun.before as any).status}
                after={(dryRun.after as any).status}
              />
              <p className="text-[11px] text-muted-foreground pt-1">
                external_address, display_name, purpose, id, organization_id e channel permanecem
                inalterados.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            disabled={busy || !existing}
            onClick={() => dryRunMutation.mutate()}
          >
            {dryRunMutation.isPending ? "Simulando..." : "Simular (dry-run)"}
          </Button>
          <Button
            disabled={busy || !existing}
            onClick={() => migrateMutation.mutate()}
          >
            {migrateMutation.isPending ? "Migrando..." : "Migrar agora"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DiffRow({ label, before, after }: { label: string; before: unknown; after: unknown }) {
  const eq = JSON.stringify(before) === JSON.stringify(after);
  return (
    <div className="grid grid-cols-[140px_1fr_1fr] gap-2 items-start">
      <span className="text-muted-foreground font-mono">{label}</span>
      <span className={`font-mono break-all ${eq ? "" : "line-through text-muted-foreground"}`}>
        {String(before ?? "—")}
      </span>
      <span className={`font-mono break-all ${eq ? "text-muted-foreground" : "text-foreground font-medium"}`}>
        {String(after ?? "—")}
      </span>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
  orgIntegration: any;
  onUpdated: () => void;
}

const DEFAULTS = {
  auto_create_contact: true,
  auto_create_opportunity: false,
  default_pipeline_stage_id: null as string | null,
  default_lifecycle_stage: "lead",
  default_owner_user_id: null as string | null,
  use_round_robin: true,
  set_name_confirmed: true,
  auto_send_whatsapp: false,
  process_unmapped_forms: false,
};

export function SettingsCard({ orgIntegration, onUpdated }: Props) {
  const initial = { ...DEFAULTS, ...((orgIntegration?.config_values as any)?.meta_lead_ads_settings || {}) };
  const [s, setS] = useState(initial);

  useEffect(() => {
    setS({ ...DEFAULTS, ...((orgIntegration?.config_values as any)?.meta_lead_ads_settings || {}) });
  }, [orgIntegration?.id]);

  const { data: stages } = useQuery({
    queryKey: ["pipeline-stages", orgIntegration?.organization_id],
    enabled: !!orgIntegration?.organization_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("pipeline_stages")
        .select("id, name")
        .eq("organization_id", orgIntegration.organization_id)
        .order("order_index");
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const config_values = {
        ...(orgIntegration.config_values || {}),
        meta_lead_ads_settings: s,
      };
      const { error } = await supabase
        .from("organization_integrations")
        .update({ config_values })
        .eq("id", orgIntegration.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações salvas");
      onUpdated();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const Row = ({ label, hint, children }: any) => (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-2">Configurações</h2>
      <div className="divide-y">
        <Row label="Criar contato automaticamente" hint="Sempre que um novo lead chegar.">
          <Switch checked={s.auto_create_contact} onCheckedChange={(v) => setS({ ...s, auto_create_contact: v })} />
        </Row>

        <Row label="Distribuir via Round-Robin" hint="Atribui leads automaticamente entre os usuários.">
          <Switch checked={s.use_round_robin} onCheckedChange={(v) => setS({ ...s, use_round_robin: v })} />
        </Row>

        <Row label="Marcar nome como confirmado" hint="Evita que o agente de IA pergunte o nome novamente.">
          <Switch checked={s.set_name_confirmed} onCheckedChange={(v) => setS({ ...s, set_name_confirmed: v })} />
        </Row>

        <Row label="Criar oportunidade automaticamente" hint="Cria uma oportunidade no pipeline escolhido.">
          <Switch
            checked={s.auto_create_opportunity}
            onCheckedChange={(v) => setS({ ...s, auto_create_opportunity: v })}
          />
        </Row>

        {s.auto_create_opportunity && (
          <div className="py-3 space-y-1.5">
            <Label className="text-xs">Etapa inicial do pipeline</Label>
            <Select
              value={s.default_pipeline_stage_id || ""}
              onValueChange={(v) => setS({ ...s, default_pipeline_stage_id: v })}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {stages?.map((st: any) => (
                  <SelectItem key={st.id} value={st.id}>
                    {st.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Row label="Enviar WhatsApp automático" hint="Em breve — disparo via agente de IA.">
          <Switch
            checked={s.auto_send_whatsapp}
            disabled
            onCheckedChange={(v) => setS({ ...s, auto_send_whatsapp: v })}
          />
        </Row>
      </div>

      <div className="flex justify-end mt-4">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Salvando..." : "Salvar configurações"}
        </Button>
      </div>
    </Card>
  );
}

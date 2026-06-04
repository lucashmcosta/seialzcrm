import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  whatsapp_template_id: null as string | null,
  whatsapp_template_variables: {} as Record<string, string>,
  process_unmapped_forms: false,
};

const AVAILABLE_TOKENS = [
  "{first_name}",
  "{full_name}",
  "{form_name}",
  "{campaign_name}",
  "{ad_name}",
];

export function SettingsCard({ orgIntegration, onUpdated }: Props) {
  const qc = useQueryClient();
  const initial = { ...DEFAULTS, ...((orgIntegration?.config_values as any)?.meta_lead_ads_settings || {}) };
  const [s, setS] = useState(initial);

  // Re-sync when the underlying row changes (id OR persisted settings)
  const persistedKey = JSON.stringify(
    (orgIntegration?.config_values as any)?.meta_lead_ads_settings || {}
  );
  useEffect(() => {
    setS({ ...DEFAULTS, ...((orgIntegration?.config_values as any)?.meta_lead_ads_settings || {}) });
  }, [orgIntegration?.id, persistedKey]);

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

  const { data: templates } = useQuery({
    queryKey: ["wa-templates-approved", orgIntegration?.organization_id],
    enabled: !!orgIntegration?.organization_id && s.auto_send_whatsapp,
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_templates")
        .select("id, friendly_name, body, status, is_active")
        .eq("organization_id", orgIntegration.organization_id)
        .eq("status", "approved")
        .eq("is_active", true)
        .order("friendly_name");
      return data || [];
    },
  });

  const selectedTemplate = useMemo(
    () => templates?.find((t: any) => t.id === s.whatsapp_template_id),
    [templates, s.whatsapp_template_id]
  );

  const templateVars = useMemo(() => {
    if (!selectedTemplate?.body) return [] as string[];
    const matches = selectedTemplate.body.match(/\{\{(\d+)\}\}/g) || [];
    return [...new Set(matches.map((m: string) => m.replace(/[{}]/g, "")))] as string[];
  }, [selectedTemplate]);

  const save = useMutation({
    mutationFn: async () => {
      if (!orgIntegration?.id) {
        throw new Error("Integração não carregada. Recarregue a página.");
      }
      if (s.auto_send_whatsapp && !s.whatsapp_template_id) {
        throw new Error("Selecione um template para o disparo automático.");
      }
      const config_values = {
        ...(orgIntegration.config_values || {}),
        meta_lead_ads_settings: s,
      };
      const { data, error } = await supabase
        .from("organization_integrations")
        .update({ config_values })
        .eq("id", orgIntegration.id)
        .select("id, config_values")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        // RLS silently rejected — update returned 0 rows
        throw new Error(
          "Não foi possível salvar: você não tem permissão para alterar esta integração nesta organização."
        );
      }

      const saved = (data.config_values as any)?.meta_lead_ads_settings || {};
      if (
        saved.auto_send_whatsapp !== s.auto_send_whatsapp ||
        (saved.whatsapp_template_id ?? null) !== (s.whatsapp_template_id ?? null)
      ) {
        throw new Error(
          "O banco confirmou o save, mas os valores não bateram. Tente novamente."
        );
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["org-integration", "meta-lead-ads"] });
      qc.invalidateQueries({ queryKey: ["organization-integrations"] });
      onUpdated();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
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

        <Row label="Sempre criar oportunidade" hint="Fallback: cria uma oportunidade vazia mesmo quando nenhuma pergunta do form foi mapeada para a oportunidade.">
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

        <Row label="Enviar WhatsApp automático" hint="Dispara um template aprovado para o lead assim que ele chegar.">
          <Switch
            checked={s.auto_send_whatsapp}
            onCheckedChange={(v) => setS({ ...s, auto_send_whatsapp: v, whatsapp_template_id: v ? s.whatsapp_template_id : null })}
          />
        </Row>

        {s.auto_send_whatsapp && (
          <div className="py-3 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Template aprovado</Label>
              <Select
                value={s.whatsapp_template_id || ""}
                onValueChange={(v) => setS({ ...s, whatsapp_template_id: v, whatsapp_template_variables: {} })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={templates?.length ? "Selecione um template" : "Nenhum template aprovado"} />
                </SelectTrigger>
                <SelectContent>
                  {templates?.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.friendly_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(!templates || templates.length === 0) && (
                <p className="text-xs text-muted-foreground">
                  Crie e aprove um template em Configurações → WhatsApp Templates.
                </p>
              )}
            </div>

            {selectedTemplate && (
              <div className="rounded-md border p-3 bg-muted/30 space-y-2">
                <p className="text-xs text-muted-foreground">Prévia do template:</p>
                <p className="text-sm whitespace-pre-wrap">{selectedTemplate.body}</p>
              </div>
            )}

            {templateVars.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Preencha cada variável. Você pode usar tokens dinâmicos:{" "}
                  <span className="font-mono">{AVAILABLE_TOKENS.join(" ")}</span>
                  . Se deixar em branco, <span className="font-mono">{`{{1}}`}</span> usa automaticamente o primeiro nome do lead.
                </p>
                {templateVars.map((v) => (
                  <div key={v} className="space-y-1">
                    <Label className="text-xs">Variável {`{{${v}}}`}</Label>
                    <Input
                      value={s.whatsapp_template_variables?.[v] || ""}
                      placeholder="Ex: Olá {first_name}!"
                      onChange={(e) =>
                        setS({
                          ...s,
                          whatsapp_template_variables: {
                            ...(s.whatsapp_template_variables || {}),
                            [v]: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end mt-4">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Salvando..." : "Salvar configurações"}
        </Button>
      </div>
    </Card>
  );
}

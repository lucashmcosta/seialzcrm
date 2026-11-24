// Encerrar a conversa e perder a oportunidade juntas (ferramenta end_conversation do agente).
// Liga por agente em tool_settings.end_conversation.mark_lost; precisa de motivo de perda cadastrado na org.
// A perda vai por fn_mark_opportunity_lost_internal_v1 com actor_type 'agent' (pode usar detalhe "só automação").
import { catalogText, lossCodes, resolveLossCode, type LossOptions } from "../loss-suggestion.ts";

type Db = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };

export function markLostEnabled(toolSettings: unknown): boolean {
  const s = (toolSettings as Record<string, any> | null)?.end_conversation;
  return s?.mark_lost === true;
}

/** Cadastro que o agente pode usar: motivos e detalhes ativos, inclusive os "só automação". */
export async function loadAgentLossOptions(db: Db, organizationId: string): Promise<LossOptions | null> {
  const [{ data: reasons }, { data: details }, { data: settings }] = await Promise.all([
    db.from("opportunity_loss_reasons").select("id, code, name, order_index")
      .eq("organization_id", organizationId).eq("is_active", true).order("order_index"),
    db.from("opportunity_loss_reason_details").select("id, reason_id, code, name, help_text, order_index")
      .eq("organization_id", organizationId).eq("is_active", true).order("order_index"),
    db.from("opportunity_loss_settings").select("detail_mode").eq("organization_id", organizationId).maybeSingle(),
  ]);
  if (!reasons?.length) return null;
  const detailsOff = settings?.detail_mode === "off";
  return {
    reasons: reasons.map((r: any) => ({
      id: r.id, code: r.code, name: r.name,
      details: detailsOff ? [] : (details ?? []).filter((d: any) => d.reason_id === r.id)
        .map((d: any) => ({ id: d.id, code: d.code, name: d.name, help_text: d.help_text })),
    })),
  };
}

/** end_conversation com o motivo de perda. Sem cadastro, a definição volta como está. */
export function endConversationWithLoss(def: any, options: LossOptions | null): any {
  if (!options) return def;
  return {
    ...def,
    function: {
      ...def.function,
      description: `${def.function.description} Também marca a oportunidade aberta como perdida: informe loss_code com o motivo que mais se aplica.`,
      parameters: {
        ...def.function.parameters,
        properties: {
          ...def.function.parameters.properties,
          loss_code: {
            type: "string",
            enum: lossCodes(options),
            description: `Motivo da perda (código — motivo › detalhe):\n${catalogText(options)}`,
          },
        },
      },
    },
  };
}

export interface AgentLossResult { lost: boolean; note: string }

/** Marca como perdida a oportunidade aberta mais recente do contato. Nunca lança: o encerramento segue. */
export async function markLostByAgent(db: Db, p: {
  organizationId: string; contactId: string | null; agentId?: string; code: unknown; reason?: string; options: LossOptions;
}): Promise<AgentLossResult> {
  const choice = resolveLossCode(p.code, p.options);
  if (!choice) return { lost: false, note: "sem motivo válido" };
  if (!p.contactId) return { lost: false, note: "sem contato" };
  const { data: opp } = await db.from("opportunities").select("id")
    .eq("organization_id", p.organizationId).eq("contact_id", p.contactId).eq("status", "open").is("deleted_at", null)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!opp) return { lost: false, note: "sem oportunidade aberta" };
  const { error } = await db.rpc("fn_mark_opportunity_lost_internal_v1", {
    _organization_id: p.organizationId,
    _opportunity_id: opp.id,
    _reason_id: choice.reasonId,
    _detail_id: choice.detailId,
    _description: (p.reason ?? "").trim().slice(0, 2000) || null,
    _close_date: null,
    _actor_type: "agent",
    _actor_user_id: null,
    _automation_ref: p.agentId ? `agent:${p.agentId}` : "agent",
    _source: "ai_agent",
  });
  if (error) {
    console.error("[agent-loss] falhou ao marcar perdida", error.message);
    return { lost: false, note: error.message };
  }
  return { lost: true, note: "oportunidade marcada como perdida" };
}

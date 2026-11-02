// Oportunidade automática na entrada do WhatsApp (Twilio, Meta e Evolution).
// Regras vêm de inbound_settings (por número ou da integração):
//   auto_create_opportunity       liga/desliga
//   opportunity_trigger           'new_contact' (padrão: só contato recém-criado)
//                                 | 'no_open_opportunity' (qualquer contato sem oportunidade aberta)
//   reopen_skip_won_days          com 'no_open_opportunity': não cria se o contato ganhou uma
//                                 oportunidade nos últimos N dias (0/ausente = sem carência)
//   default_stage_id              etapa inicial (inválida/ausente = primeira etapa da org)

export type OpportunityTrigger = "new_contact" | "no_open_opportunity";

export interface InboundOpportunitySettings {
  auto_create_opportunity?: boolean;
  opportunity_trigger?: OpportunityTrigger | null;
  reopen_skip_won_days?: number | null;
  default_stage_id?: string | null;
}

export type InboundOpportunityDecision =
  | "create"
  | "disabled"
  | "existing_contact"
  | "open_opportunity"
  | "recent_win";

/** Só a regra, sem banco: o que fazer com a mensagem que chegou. */
export function decideInboundOpportunity(input: {
  settings: InboundOpportunitySettings;
  contactCreated: boolean;
  hasOpenOpportunity: boolean;
  lastWonAt: string | null;
  now: Date;
}): InboundOpportunityDecision {
  const { settings, contactCreated, hasOpenOpportunity, lastWonAt, now } = input;
  if (!settings.auto_create_opportunity) return "disabled";
  const trigger: OpportunityTrigger = settings.opportunity_trigger === "no_open_opportunity"
    ? "no_open_opportunity"
    : "new_contact";
  if (trigger === "new_contact" && !contactCreated) return "existing_contact";
  if (hasOpenOpportunity) return "open_opportunity";
  const days = Number(settings.reopen_skip_won_days) || 0;
  if (!contactCreated && days > 0 && lastWonAt) {
    const wonMs = Date.parse(lastWonAt);
    if (Number.isFinite(wonMs) && now.getTime() - wonMs < days * 86_400_000) return "recent_win";
  }
  return "create";
}

/** Aplica a regra e cria a oportunidade. Devolve o id criado ou null. Nunca lança. */
export async function autoCreateInboundOpportunity(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  input: {
    organizationId: string;
    contactId: string;
    contactName: string;
    contactOwnerId: string | null;
    contactCreated: boolean;
    settings: InboundOpportunitySettings;
    logTag: string;
  },
): Promise<string | null> {
  const { organizationId, contactId, settings, logTag } = input;
  if (!settings.auto_create_opportunity) return null;
  if (settings.opportunity_trigger !== "no_open_opportunity" && !input.contactCreated) return null;

  try {
    const { data: openOpp } = await supabase
      .from("opportunities")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .eq("status", "open")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    let lastWonAt: string | null = null;
    if (!openOpp && !input.contactCreated && Number(settings.reopen_skip_won_days) > 0) {
      const { data: won } = await supabase
        .from("opportunities")
        .select("won_at")
        .eq("organization_id", organizationId)
        .eq("contact_id", contactId)
        .eq("status", "won")
        .is("deleted_at", null)
        .not("won_at", "is", null)
        .order("won_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastWonAt = won?.won_at ?? null;
    }

    const decision = decideInboundOpportunity({
      settings,
      contactCreated: input.contactCreated,
      hasOpenOpportunity: !!openOpp,
      lastWonAt,
      now: new Date(),
    });
    if (decision !== "create") {
      console.log(`[${logTag}] inbound opp skipped`, JSON.stringify({ decision }));
      return null;
    }

    let stageId: string | null = null;
    if (settings.default_stage_id) {
      const { data: valid } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("id", settings.default_stage_id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (valid) stageId = valid.id;
    }
    if (!stageId) {
      const { data: first } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("organization_id", organizationId)
        .order("order_index", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (first) stageId = first.id;
    }
    if (!stageId) {
      console.error(`[${logTag}] no pipeline_stages — skipping opp`, organizationId);
      return null;
    }

    const oppData: Record<string, unknown> = {
      organization_id: organizationId,
      contact_id: contactId,
      title: `Oportunidade - ${input.contactName}`,
      status: "open",
      pipeline_stage_id: stageId,
    };
    if (input.contactOwnerId) oppData.owner_user_id = input.contactOwnerId;

    const { data: newOpp, error } = await supabase
      .from("opportunities")
      .insert(oppData)
      .select("id")
      .single();
    if (error) {
      console.error(`[${logTag}] auto-create opp error`, error.message);
      return null;
    }
    console.log(`[${logTag}] auto-created opportunity`, newOpp?.id);
    return newOpp?.id ?? null;
  } catch (e) {
    console.error(`[${logTag}] auto-create opp exception`, (e as Error).message);
    return null;
  }
}

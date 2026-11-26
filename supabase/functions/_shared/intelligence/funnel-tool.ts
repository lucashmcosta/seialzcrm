// Funil movido pelo agente de IA.
//
// Serve para qualquer org: só vale com a ferramenta classify_lead ligada no agente
// (enabled_tools) e configurada em tool_settings.classify_lead. As etapas e os motivos de perda
// são os da própria org, escolhidos na tela do agente. Nada aqui conhece uma org.
//
// Três caminhos movem a oportunidade, todos pelas funções que a tela já usa:
//   1. o modelo registra a conclusão do caso (classify_lead): vai para a etapa do resultado.
//      Quem não se encaixa NÃO passa por aqui: é o end_conversation com loss_code
//      (agent-loss.ts) que encerra e perde, com o motivo do catálogo da org;
//   2. regra, sem o modelo: a lead respondeu (vai para reply_stage_id) ou o agente passou para a
//      equipe sem classificar (vai para handoff_stage_id);
//   3. regra, na rotina agent-followups: os follow-ups acabaram e a lead não respondeu por N horas
//      (perda com o detalhe configurado para a etapa).
//
// Garantias: o agente só avança (ordem da etapa maior que a atual), nunca mexe em oportunidade
// ganha ou perdida, e a regra de silêncio não age em conversa que está com a equipe.
// Em modo "shadow" nada muda: fica só a nota interna dizendo o que teria sido feito.

import type { WidgetAgentTool, WidgetToolOutcome } from "../widgets/agent-tools.ts";

export const CLASSIFY_LEAD_TOOL = "classify_lead";
/** Marca da nota interna (metadata.agent_funnel). Não é agent_widget_result de propósito. */
export const FUNNEL_NOTE_KEY = "agent_funnel";
export const FUNNEL_SOURCE = "ai_agent_funnel";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z][a-z0-9_]{0,39}$/;

export interface FunnelOutcome {
  key: string;
  label: string;
  /** Quando usar, para o modelo (ex.: "o caso segue e ela quer contratar"). */
  description: string;
  /** Etapa para onde vai. */
  stage_id: string;
}

export interface SilenceRule {
  stage_id: string;
  detail_id: string;
}

export interface FunnelSettings {
  mode: "shadow" | "apply";
  outcomes: FunnelOutcome[];
  reply_stage_id: string | null;
  handoff_stage_id: string | null;
  silence_after_hours: number;
  silence_rules: SilenceRule[];
}

const uuidOrNull = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
const text = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function parseFunnelSettings(raw: unknown): FunnelSettings | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const outcomes: FunnelOutcome[] = [];
  for (const o of Array.isArray(r.outcomes) ? r.outcomes : []) {
    const x = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
    const key = text(x.key, 40).toLowerCase();
    const label = text(x.label, 60);
    if (!KEY.test(key) || !label || outcomes.some((y) => y.key === key)) continue;
    const stage = uuidOrNull(x.stage_id);
    if (!stage) continue;
    outcomes.push({ key, label, description: text(x.description, 300), stage_id: stage });
  }
  const rules: SilenceRule[] = [];
  for (const s of Array.isArray(r.silence_rules) ? r.silence_rules : []) {
    const x = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const stage = uuidOrNull(x.stage_id);
    const detail = uuidOrNull(x.detail_id);
    if (stage && detail && !rules.some((y) => y.stage_id === stage)) rules.push({ stage_id: stage, detail_id: detail });
  }
  const hours = Number(r.silence_after_hours);
  const settings: FunnelSettings = {
    mode: r.mode === "apply" ? "apply" : "shadow",
    outcomes,
    reply_stage_id: uuidOrNull(r.reply_stage_id),
    handoff_stage_id: uuidOrNull(r.handoff_stage_id),
    // Mínimo de 24 h: menos que isso perde quem só respondeu no dia seguinte.
    silence_after_hours: Number.isFinite(hours) && hours >= 24 ? Math.min(Math.round(hours), 24 * 30) : 72,
    silence_rules: rules,
  };
  const anything = outcomes.length || settings.reply_stage_id || settings.handoff_stage_id || rules.length;
  return anything ? settings : null;
}

// ---------------------------------------------------------------------------------------------
// Decisões (puras)
// ---------------------------------------------------------------------------------------------

export interface StageInfo {
  id: string;
  order_index: number;
  type: string | null;
}

export interface OpenOpportunity {
  id: string;
  status: string;
  pipeline_stage_id: string | null;
}

export type FunnelAction =
  | { kind: "move"; stageId: string }
  | { kind: "lose"; detailId: string }
  | { kind: "noop"; why: "no_opportunity" | "closed" | "unknown_stage" | "not_forward" | "detail_not_allowed" };

const isClosedType = (t: string | null | undefined) => t === "won" || t === "lost";

/** Mover para a etapa só se ela vier depois da atual. Nunca de/para ganho ou perdido. */
export function decideMove(opp: OpenOpportunity | null, stages: StageInfo[], targetStageId: string): FunnelAction {
  if (!opp) return { kind: "noop", why: "no_opportunity" };
  if (opp.status !== "open") return { kind: "noop", why: "closed" };
  const target = stages.find((s) => s.id === targetStageId);
  if (!target || isClosedType(target.type)) return { kind: "noop", why: "unknown_stage" };
  const current = stages.find((s) => s.id === opp.pipeline_stage_id);
  if (current && isClosedType(current.type)) return { kind: "noop", why: "closed" };
  if (current && target.order_index <= current.order_index) return { kind: "noop", why: "not_forward" };
  return { kind: "move", stageId: target.id };
}

/** Perder só oportunidade aberta e só com um detalhe permitido. */
export function decideLoss(opp: OpenOpportunity | null, stages: StageInfo[], detailId: string | null, allowed: string[]): FunnelAction {
  if (!opp) return { kind: "noop", why: "no_opportunity" };
  if (opp.status !== "open") return { kind: "noop", why: "closed" };
  const current = stages.find((s) => s.id === opp.pipeline_stage_id);
  if (current && isClosedType(current.type)) return { kind: "noop", why: "closed" };
  if (!detailId || !allowed.includes(detailId)) return { kind: "noop", why: "detail_not_allowed" };
  return { kind: "lose", detailId };
}

/**
 * Regra de silêncio: os follow-ups acabaram, o último saiu há mais de N horas e a lead não
 * escreveu depois dele. Devolve o detalhe da perda, ou null.
 */
export function silenceLossDetail(input: {
  settings: FunnelSettings;
  stageId: string | null;
  followupCount: number;
  followupTotal: number;
  lastFollowupAt: string | null;
  lastInboundAt: string | null;
  now: number;
}): string | null {
  const { settings, stageId, followupCount, followupTotal, lastFollowupAt, lastInboundAt, now } = input;
  if (!stageId || followupTotal < 1 || followupCount < followupTotal || !lastFollowupAt) return null;
  const last = Date.parse(lastFollowupAt);
  if (!Number.isFinite(last) || now - last < settings.silence_after_hours * 3600_000) return null;
  if (lastInboundAt && Date.parse(lastInboundAt) > last) return null;
  return settings.silence_rules.find((r) => r.stage_id === stageId)?.detail_id ?? null;
}

// ---------------------------------------------------------------------------------------------
// Ferramenta do modelo
// ---------------------------------------------------------------------------------------------

export interface LossDetailInfo {
  id: string;
  name: string;
  requires_description: boolean;
}

export interface FunnelDeps {
  isTestMode: boolean;
  settings: FunnelSettings | null;
  stages: StageInfo[];
  lossDetails: LossDetailInfo[];
  openOpportunity(): Promise<OpenOpportunity | null>;
  move(opportunityId: string, stageId: string): Promise<{ ok: boolean; error?: string }>;
  lose(opportunityId: string, detailId: string, description: string | null): Promise<{ ok: boolean; error?: string }>;
  note(content: string, meta: Record<string, unknown>): Promise<void>;
  /** Já existe nota de sombra desta origem/resultado para esta oportunidade (evita repetir). */
  shadowNoted(opportunityId: string, origin: string, outcome: string | null): Promise<boolean>;
}

const DONE = "Registrado. Não comente isso com a cliente; siga a conversa normalmente.";

export function funnelToolParameters(settings: FunnelSettings): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      outcome: {
        type: "string",
        enum: settings.outcomes.map((o) => o.key),
        description: settings.outcomes.map((o) => `${o.key}: ${o.description || o.label}`).join(" | "),
      },
      reason: { type: "string", description: "Por que, em uma frase curta, sem copiar CPF, telefone ou e-mail." },
    },
    required: ["outcome", "reason"],
  };
}

export async function runClassifyLead(args: any, deps: FunnelDeps): Promise<WidgetToolOutcome> {
  const settings = deps.settings;
  if (!settings || !settings.outcomes.length) return { modelMessage: "A classificação não está configurada neste agente. Siga a conversa." };
  const outcome = settings.outcomes.find((o) => o.key === String(args?.outcome ?? "").trim().toLowerCase());
  if (!outcome) return { modelMessage: `Resultado inválido. Use um destes: ${settings.outcomes.map((o) => o.key).join(", ")}.` };
  const reason = text(args?.reason, 300) || null;

  // Simulador: não existe oportunidade; só confirma o que seria feito.
  if (deps.isTestMode) return { modelMessage: `${DONE} (Simulado: ${outcome.label}.)` };

  const opp = await deps.openOpportunity();
  await applyFunnelAction(deps, settings.mode, opp, decideMove(opp, deps.stages, outcome.stage_id), {
    origin: "classify_lead", outcome: outcome.key, label: outcome.label, reason,
  });
  return { modelMessage: DONE };
}

/** Aplica (ou, em modo sombra, só registra) e deixa a nota interna para a equipe. */
export async function applyFunnelAction(
  deps: Pick<FunnelDeps, "move" | "lose" | "note" | "shadowNoted">,
  mode: FunnelSettings["mode"],
  opp: OpenOpportunity | null,
  action: FunnelAction,
  info: { origin: string; outcome?: string; label: string; reason: string | null; detailName?: string | null; description?: string | null },
): Promise<{ applied: boolean; error?: string }> {
  const meta = { origin: info.origin, outcome: info.outcome ?? null, mode, action: action.kind, opportunity_id: opp?.id ?? null };
  if (action.kind === "noop") {
    console.log(`[${CLASSIFY_LEAD_TOOL}] noop`, { ...meta, why: action.why });
    return { applied: false };
  }
  const what = action.kind === "move" ? `vai para a etapa "${info.label}"` : `perdida: ${info.detailName ?? info.label}`;
  const why = info.reason ? ` Motivo: ${info.reason}` : "";
  if (mode === "shadow") {
    if (await deps.shadowNoted(opp!.id, info.origin, info.outcome ?? null)) return { applied: false };
    console.log(`[${CLASSIFY_LEAD_TOOL}] would_${action.kind}`, meta);
    await deps.note(`Funil pelo agente (em teste, nada foi mudado): a oportunidade ${what}.${why}`, { ...meta, shadow: true });
    return { applied: false };
  }
  const r = action.kind === "move"
    ? await deps.move(opp!.id, action.stageId)
    : await deps.lose(opp!.id, action.detailId, info.description ?? null);
  if (!r.ok) {
    console.warn(`[${CLASSIFY_LEAD_TOOL}] não aplicado`, { ...meta, error: r.error });
    return { applied: false, error: r.error };
  }
  console.log(`[${CLASSIFY_LEAD_TOOL}] ${action.kind}`, meta);
  await deps.note(`Funil pelo agente: a oportunidade ${what}.${why}`, meta);
  return { applied: true };
}

// ---------------------------------------------------------------------------------------------
// Dependências reais
// ---------------------------------------------------------------------------------------------

export interface FunnelContext {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  organizationId: string;
  contactId: string | null;
  threadId: string | null;
  agentId: string;
  isTestMode: boolean;
  rawSettings: unknown;
}

export async function loadFunnelDeps(ctx: FunnelContext): Promise<FunnelDeps> {
  const db = ctx.supabase;
  const org = ctx.organizationId;
  const settings = parseFunnelSettings(ctx.rawSettings);
  const detailIds = [...new Set(settings?.silence_rules.map((r) => r.detail_id) ?? [])];
  const [{ data: stages }, { data: details }] = await Promise.all([
    db.from("pipeline_stages").select("id, order_index, type").eq("organization_id", org),
    detailIds.length
      ? db.from("opportunity_loss_reason_details").select("id, name, requires_description")
        .eq("organization_id", org).eq("is_active", true).in("id", detailIds)
      : Promise.resolve({ data: [] }),
  ]);
  return {
    isTestMode: ctx.isTestMode,
    settings,
    stages: (stages ?? []) as StageInfo[],
    lossDetails: (details ?? []) as LossDetailInfo[],
    async openOpportunity() {
      if (!ctx.contactId) return null;
      const { data } = await db.from("opportunities").select("id, status, pipeline_stage_id")
        .eq("organization_id", org).eq("contact_id", ctx.contactId).eq("status", "open").is("deleted_at", null)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      return data ?? null;
    },
    async move(opportunityId, stageId) {
      const { data, error } = await db.rpc("transition_opportunity_stage_v1", {
        _organization_id: org, _opportunity_id: opportunityId, _target_stage_id: stageId,
        _close_date: null, _override: false, _override_reason: "", _source: FUNNEL_SOURCE,
      });
      return error || data?.ok === false ? { ok: false, error: String(error?.code ?? data?.error ?? "erro") } : { ok: true };
    },
    async lose(opportunityId, detailId, description) {
      const { error } = await db.rpc("fn_mark_opportunity_lost_internal_v1", {
        _organization_id: org, _opportunity_id: opportunityId, _reason_id: null, _detail_id: detailId,
        _description: description, _close_date: null, _actor_type: "automation", _actor_user_id: null,
        _automation_ref: `agent:${ctx.agentId}`, _source: FUNNEL_SOURCE,
      });
      return error ? { ok: false, error: String(error.code ?? error.message) } : { ok: true };
    },
    async note(content, meta) {
      if (!ctx.threadId) return;
      const { error } = await db.from("messages").insert({
        organization_id: org, thread_id: ctx.threadId, content, direction: "internal", is_internal_note: true,
        sender_type: "system", sender_agent_id: ctx.agentId, sent_at: new Date().toISOString(),
        metadata: { [FUNNEL_NOTE_KEY]: meta },
      });
      if (error) console.warn(`[${CLASSIFY_LEAD_TOOL}] nota interna não gravada`, error.code);
    },
    async shadowNoted(opportunityId, origin, outcome) {
      if (!ctx.threadId) return false;
      let q = db.from("messages").select("id", { count: "exact", head: true })
        .eq("thread_id", ctx.threadId).eq("is_internal_note", true)
        .eq(`metadata->${FUNNEL_NOTE_KEY}->>opportunity_id`, opportunityId)
        .eq(`metadata->${FUNNEL_NOTE_KEY}->>origin`, origin);
      if (outcome) q = q.eq(`metadata->${FUNNEL_NOTE_KEY}->>outcome`, outcome);
      const { count } = await q;
      return (count ?? 0) > 0;
    },
  };
}

function toolPrompt(settings: FunnelSettings): string {
  const lines = settings.outcomes.map((o) => `  - ${o.key}: ${o.description || o.label}`).join("\n");
  return `
- **${CLASSIFY_LEAD_TOOL}**: Quando chegar a uma conclusão sobre o caso, registre com ${CLASSIFY_LEAD_TOOL}, na mesma resposta em que contar o resultado ou passar para a equipe. Resultados:
${lines}
  Use uma vez por conclusão. Se a conclusão mudar depois (ela trouxe informação nova), registre de novo. Não comente o registro com a cliente.
  Caso que não se encaixa não é registrado aqui: depois da despedida, use end_conversation.
`;
}

export async function funnelToolsForAgent(enabledTools: string[], ctx: FunnelContext): Promise<WidgetAgentTool[]> {
  if (!enabledTools.includes(CLASSIFY_LEAD_TOOL)) return [];
  const deps = await loadFunnelDeps(ctx);
  const settings = deps.settings;
  if (!settings || !settings.outcomes.length) return [];
  return [{
    widgetKey: "agent_funnel",
    name: CLASSIFY_LEAD_TOOL,
    description: "Registra a conclusão sobre o caso da lead (ex.: qualificada, a equipe analisa) e move a oportunidade para a etapa certa do funil.",
    parameters: funnelToolParameters(settings),
    prompt: toolPrompt(settings),
    run: (args) => runClassifyLead(args, deps),
  }];
}

/**
 * Regras sem o modelo, depois de uma resposta do agente:
 *  - "reply": a lead já respondeu pelo menos uma vez depois da abertura → reply_stage_id;
 *  - "handoff": o agente passou para a equipe sem registrar a conclusão → handoff_stage_id.
 * Só avança; em modo sombra, só registra.
 */
export async function applyFunnelRule(kind: "reply" | "handoff", ctx: FunnelContext): Promise<void> {
  if (ctx.isTestMode) return;
  const settings = parseFunnelSettings(ctx.rawSettings);
  const stageId = kind === "reply" ? settings?.reply_stage_id : settings?.handoff_stage_id;
  if (!settings || !stageId) return;
  if (kind === "reply") {
    // A primeira mensagem é a abertura (ex.: o texto do anúncio). Responder é a segunda em diante.
    if (!ctx.threadId) return;
    const { count } = await ctx.supabase.from("messages").select("id", { count: "exact", head: true })
      .eq("thread_id", ctx.threadId).eq("direction", "inbound").is("deleted_at", null);
    if ((count ?? 0) < 2) return;
  }
  const deps = await loadFunnelDeps(ctx);
  const opp = await deps.openOpportunity();
  const action = decideMove(opp, deps.stages, stageId);
  if (action.kind === "noop") return;
  const { data: stage } = await ctx.supabase.from("pipeline_stages").select("name").eq("id", stageId).maybeSingle();
  await applyFunnelAction(deps, settings.mode, opp, action, {
    origin: kind === "reply" ? "rule_reply" : "rule_handoff",
    label: String(stage?.name ?? "próxima etapa"),
    reason: kind === "reply" ? "a lead respondeu ao agente." : "o agente passou para a equipe sem registrar a conclusão.",
  });
}

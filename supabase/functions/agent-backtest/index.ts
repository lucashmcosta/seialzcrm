// agent-backtest: testa o agente de IA com conversas antigas da própria org. Vale para todas as orgs.
// Só administrador da org chama. O agente roda em modo de teste (nada vai ao cliente), com a
// chave de IA da org, e o resultado fica em agent_backtest_runs.
//
// Cenário labor_calc: conversas em que a equipe mandou o cálculo da rescisão do widget. O agente
// recebe a conversa até a última mensagem do cliente antes desse cálculo, e o resultado compara
// o total que ele mandaria com o da equipe.
//
// Ações (POST, body.action):
//  - dry_run: conta as conversas e estima o custo, sem gastar nada.
//  - run:     roda em segundo plano e devolve run_id. Recusa se o custo estimado passar de budget_usd.
//  - status:  devolve a rodada (contagens, custo real e cada caso quando terminar).
//
// Cenário support (body.scenario = 'support'): conversas recentes da tela de atendimento. O agente
// recebe a conversa até a última resposta da equipe e o resultado mostra as duas respostas lado a
// lado, e se ele passaria a conversa para uma pessoa.
import { corsHeaders, json } from "../_shared/intelligence/byok-shared.ts";
import { requireOrgAdmin } from "../_shared/intelligence/authz.ts";
import { buildReplay, rateLimitWaitMs, type StoredMessage } from "../_shared/intelligence/agent-backtest.ts";
// Cenário labor_calc: vem do widget Central Trabalhista.
import { classifyCase, countOutcomes, parseCalcText, type BacktestOutcome } from "../_shared/widgets/labor-center/backtest.ts";
import { LABOR_CALC_CLIENT_HEADER, LABOR_CALC_TOOL } from "../_shared/widgets/labor-center/agent-tool.ts";
import { activeWidgetTools } from "../_shared/widgets/agent-tools.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const MAX_CASES = 60;
const MAX_BUDGET_USD = 20;
const CONCURRENCY = 3;
/** O Supabase limita chamadas entre funções no mesmo pedido (~30 por minuto): cada grupo de 3 leva no mínimo 9 s. */
const MIN_CHUNK_MS = 9_000;
const MAX_RATE_LIMIT_WAIT_MS = 65_000;
/** Custo por resposta quando a org ainda não tem histórico de uso do agente. */
const FALLBACK_COST_PER_CALL = 0.03;
/** Margem sobre a média: a conversa antiga pode ser maior que a média. */
const ESTIMATE_MARGIN = 1.5;

type Admin = any;

class HttpError extends Error {
  constructor(public status: number, public code: string, message = code) { super(message); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const orgId = String(body?.organization_id ?? "");
  if (!orgId) return json({ error: "missing_organization_id" }, 400);

  const auth = await requireOrgAdmin(req, orgId);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const admin = auth.admin;

  try {
    switch (body.action) {
      case "dry_run": return json(await plan(admin, orgId, body));
      case "run": return await run(admin, orgId, auth.userId, body, req.headers.get("authorization") ?? "");
      case "status": return await status(admin, orgId, String(body.run_id ?? ""));
      default: return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
    console.error("[agent-backtest] erro", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});

interface CaseRef { thread_id: string; contact_id: string; calc_at: string; team_text: string }

type Scenario = "labor_calc" | "support";
const scenarioOf = (body: any): Scenario => (body?.scenario === "support" ? "support" : "labor_calc");

async function loadAgent(admin: Admin, orgId: string, agentId: string, scenario: Scenario = "labor_calc") {
  const { data: agent } = await admin.from("ai_agents").select("id, organization_id, enabled_tools")
    .eq("id", agentId).eq("organization_id", orgId).maybeSingle();
  if (!agent) throw new HttpError(404, "agent_not_found");
  if (scenario === "labor_calc" && !((agent.enabled_tools ?? []) as string[]).includes(LABOR_CALC_TOOL)) {
    throw new HttpError(409, "tool_not_enabled", "Ligue a calculadora da rescisão no agente antes de testar.");
  }
  return agent;
}

/** Conversas em que a equipe mandou o cálculo do widget: o primeiro cálculo de cada uma, as mais recentes. */
async function findCases(admin: Admin, orgId: string, limit: number): Promise<CaseRef[]> {
  const { data, error } = await admin.from("messages")
    .select("thread_id, sent_at, content, sender_type, thread:message_threads!inner(contact_id)")
    .eq("organization_id", orgId).eq("direction", "outbound").is("deleted_at", null)
    .eq("sender_type", "user")
    .like("content", `${LABOR_CALC_CLIENT_HEADER}%`)
    .order("sent_at", { ascending: true })
    .limit(1000);
  if (error) throw new HttpError(500, "cases_lookup_failed", error.message);
  const first = new Map<string, CaseRef>();
  for (const m of data ?? []) {
    if (!first.has(m.thread_id) && m.thread?.contact_id) {
      first.set(m.thread_id, { thread_id: m.thread_id, contact_id: m.thread.contact_id, calc_at: m.sent_at, team_text: m.content });
    }
  }
  return [...first.values()].sort((a, b) => b.calc_at.localeCompare(a.calc_at)).slice(0, limit);
}

/** Atendimento: a última resposta da equipe em cada conversa recente da tela de atendimento. */
async function findSupportCases(admin: Admin, orgId: string, limit: number): Promise<CaseRef[]> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data, error } = await admin.from("messages")
    .select("thread_id, sent_at, content, thread:message_threads!inner(contact_id, business_context)")
    .eq("organization_id", orgId).eq("direction", "outbound").eq("sender_type", "user").is("deleted_at", null)
    .eq("thread.business_context", "customer_service").gte("sent_at", since)
    .not("content", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1000);
  if (error) throw new HttpError(500, "cases_lookup_failed", error.message);
  const last = new Map<string, CaseRef>();
  for (const m of data ?? []) {
    if (!last.has(m.thread_id) && m.thread?.contact_id && String(m.content).trim().length > 15) {
      last.set(m.thread_id, { thread_id: m.thread_id, contact_id: m.thread.contact_id, calc_at: m.sent_at, team_text: m.content });
    }
  }
  return [...last.values()].slice(0, limit);
}

const casesFor = (scenario: Scenario) => (scenario === "support" ? findSupportCases : findCases);

/** Média do custo real de uma resposta do agente nesta org, nos últimos 7 dias. */
async function costPerCall(admin: Admin, orgId: string): Promise<number> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await admin.from("ai_usage_logs").select("estimated_cost_usd")
    .eq("organization_id", orgId).eq("action", "ai_agent_respond").gte("created_at", since).limit(1000);
  const costs = (data ?? []).map((r: any) => Number(r.estimated_cost_usd)).filter((n: number) => Number.isFinite(n) && n > 0);
  return costs.length ? costs.reduce((a: number, b: number) => a + b, 0) / costs.length : FALLBACK_COST_PER_CALL;
}

async function plan(admin: Admin, orgId: string, body: any) {
  const agentId = String(body.agent_id ?? "");
  const scenario = scenarioOf(body);
  await loadAgent(admin, orgId, agentId, scenario);
  const limit = Math.min(Math.max(Number(body.limit ?? MAX_CASES), 1), MAX_CASES);
  const cases = await casesFor(scenario)(admin, orgId, limit);
  const perCall = await costPerCall(admin, orgId);
  return {
    scenario,
    cases: cases.length,
    cost_per_call_usd: Number(perCall.toFixed(4)),
    estimated_cost_usd: Number((cases.length * perCall * ESTIMATE_MARGIN).toFixed(2)),
  };
}

// O agente aceita no modo de teste o login de quem é da org (como o simulador). A chave de
// serviço do ambiente pode estar no formato novo, que o agente não reconhece.
async function run(admin: Admin, orgId: string, userId: string, body: any, callerAuth: string) {
  const agentId = String(body.agent_id ?? "");
  const budget = Number(body.budget_usd ?? 0);
  if (!(budget > 0) || budget > MAX_BUDGET_USD) throw new HttpError(400, "invalid_budget", `budget_usd entre 0 e ${MAX_BUDGET_USD}.`);
  const p = await plan(admin, orgId, body);
  if (!p.cases) throw new HttpError(409, "no_cases", "Não há conversas para testar.");
  if (p.estimated_cost_usd > budget) {
    throw new HttpError(402, "over_budget", `Custo estimado US$ ${p.estimated_cost_usd} passa do limite de US$ ${budget}.`);
  }
  const { data: runRow, error } = await admin.from("agent_backtest_runs").insert({
    organization_id: orgId, agent_id: agentId, scenario: p.scenario, budget_usd: budget,
    estimated_cost_usd: p.estimated_cost_usd, params: { limit: p.cases }, created_by: userId,
  }).select("id, created_at").single();
  if (error) throw new HttpError(500, "run_insert_failed", error.message);
  EdgeRuntime.waitUntil(execute(admin, orgId, agentId, runRow.id, runRow.created_at, p.cases, callerAuth, p.scenario).catch(async (e) => {
    console.error("[agent-backtest] rodada falhou", (e as Error).message);
    await admin.from("agent_backtest_runs").update({ status: "failed", error: (e as Error).message, finished_at: new Date().toISOString() }).eq("id", runRow.id);
  }));
  return json({ run_id: runRow.id, ...p });
}

async function conversationBefore(admin: Admin, orgId: string, agentTools: string[], ref: CaseRef): Promise<StoredMessage[]> {
  const { data } = await admin.from("messages")
    .select("id, content, direction, media_type, media_urls, sent_at")
    .eq("thread_id", ref.thread_id).is("deleted_at", null).neq("direction", "internal")
    .lt("sent_at", ref.calc_at)
    .order("sent_at", { ascending: false }).limit(120);
  const rows = (data ?? []).reverse();
  const audioIds = rows.filter((m: any) => String(m.media_type ?? "").startsWith("audio")).map((m: any) => m.id);
  const heard = new Map<string, string>();
  if (audioIds.length) {
    const { data: t } = await admin.from("audio_transcriptions").select("message_id, transcript, created_at")
      .in("message_id", audioIds).order("created_at", { ascending: true });
    for (const a of t ?? []) if (a.transcript) heard.set(a.message_id, a.transcript);
  }
  // O que os widgets leem dos anexos, como no agente de verdade (últimos 3 documentos do cliente).
  const notes = new Map<string, string>();
  const readers = (await activeWidgetTools(admin, orgId, agentTools)).filter((w) => w.readAttachment);
  if (readers.length) {
    const docs = rows.filter((m: any) => m.direction === "inbound" && m.media_type === "document").slice(-3);
    for (const m of docs) {
      const found: string[] = [];
      for (const r of readers) {
        const note = await r.readAttachment!({ mediaType: m.media_type, content: m.content, mediaUrls: m.media_urls }, { supabase: admin });
        if (note) found.push(note);
      }
      if (found.length) notes.set(m.id, found.join("\n"));
    }
  }
  return rows.map((m: any) => ({ content: m.content, direction: m.direction, media_type: m.media_type, transcript: heard.get(m.id) ?? null, note: notes.get(m.id) ?? null }));
}

async function testOne(admin: Admin, orgId: string, agentId: string, agentTools: string[], ref: CaseRef, callerAuth: string) {
  const team = parseCalcText(ref.team_text);
  const before = await conversationBefore(admin, orgId, agentTools, ref);
  const replay = buildReplay(before);
  const base = { thread: ref.thread_id.slice(0, 8), calc_at: ref.calc_at, team_total: team?.total ?? null, team_header: team?.header ?? null, read_document: before.some((m) => !!m.note) };
  if (!replay) return { ...base, outcome: "erro" as BacktestOutcome, error: "sem mensagem do cliente antes do cálculo" };

  const call = () => fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-agent-respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: callerAuth },
    body: JSON.stringify({ agentId, contactId: ref.contact_id, threadId: ref.thread_id, isTestMode: true, history: replay.history, message: replay.message }),
  });
  let res = await call();
  let out = await res.json().catch(() => ({}));
  // Bateu no limite de chamadas entre funções: espera o tempo que ele pede e tenta de novo, uma vez.
  const wait = rateLimitWaitMs(out);
  if (wait != null) {
    await new Promise((r) => setTimeout(r, Math.min(wait + 1000, MAX_RATE_LIMIT_WAIT_MS)));
    res = await call();
    out = await res.json().catch(() => ({}));
  }
  if (!res.ok || out?.success === false) return { ...base, outcome: "erro" as BacktestOutcome, error: String(out?.error ?? `HTTP ${res.status}`) };

  const bubbles: string[] = Array.isArray(out.bubbles) ? out.bubbles : [];
  const tools: string[] = Array.isArray(out.toolsExecuted) ? out.toolsExecuted : [];
  const calcText = bubbles.find((b) => b.startsWith(LABOR_CALC_CLIENT_HEADER)) ?? null;
  const agentCalc = calcText ? parseCalcText(calcText) : null;
  return {
    ...base,
    outcome: classifyCase(team, agentCalc, tools.includes(LABOR_CALC_TOOL)),
    agent_total: agentCalc?.total ?? null,
    agent_header: agentCalc?.header ?? null,
    tools,
    agent_reply: bubbles.filter((b) => b !== calcText).join("\n\n").slice(0, 800),
  };
}

async function execute(admin: Admin, orgId: string, agentId: string, runId: string, startedAt: string, limit: number, callerAuth: string, scenario: Scenario = "labor_calc") {
  const cases = await casesFor(scenario)(admin, orgId, limit);
  const { enabled_tools } = await loadAgent(admin, orgId, agentId, scenario);
  const agentTools = (enabled_tools ?? []) as string[];
  const results: any[] = [];
  for (let i = 0; i < cases.length; i += CONCURRENCY) {
    const chunkStart = Date.now();
    const chunk = await Promise.all(cases.slice(i, i + CONCURRENCY).map((c) =>
      (scenario === "support" ? testSupport(admin, orgId, agentId, agentTools, c, callerAuth) : testOne(admin, orgId, agentId, agentTools, c, callerAuth)).catch((e) => ({ thread: c.thread_id.slice(0, 8), outcome: "erro" as BacktestOutcome, error: (e as Error).message }))));
    results.push(...chunk);
    const spent = Date.now() - chunkStart;
    if (spent < MIN_CHUNK_MS) await new Promise((r) => setTimeout(r, MIN_CHUNK_MS - spent));
    // Grava a cada grupo: se a função for interrompida pelo limite de tempo, o que já rodou fica.
    await admin.from("agent_backtest_runs").update({ cases: results, counts: { done: results.length, total: cases.length } }).eq("id", runId);
  }
  // Custo real: o modo de teste registra o uso sem conversa (entity_id vazio).
  const { data: usage } = await admin.from("ai_usage_logs").select("estimated_cost_usd")
    .eq("organization_id", orgId).eq("action", "ai_agent_respond").is("entity_id", null).gte("created_at", startedAt).limit(1000);
  const cost = (usage ?? []).reduce((a: number, r: any) => a + (Number(r.estimated_cost_usd) || 0), 0);
  await admin.from("agent_backtest_runs").update({
    status: "done", cases: results, cost_usd: Number(cost.toFixed(4)), finished_at: new Date().toISOString(),
    counts: { done: results.length, total: cases.length, ...(scenario === "support" ? countSupport(results) : countOutcomes(results.map((r) => r.outcome))) },
  }).eq("id", runId);
}

function countSupport(results: any[]) {
  const c = { respondeu: 0, passou_para_pessoa: 0, erro: 0 };
  for (const r of results) {
    if (r.outcome === "passou_para_pessoa") c.passou_para_pessoa++;
    else if (r.outcome === "respondeu") c.respondeu++;
    else c.erro++;
  }
  return c;
}

async function callAgent(agentId: string, ref: CaseRef, replay: { history: unknown; message: string }, callerAuth: string) {
  const call = () => fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-agent-respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: callerAuth },
    body: JSON.stringify({ agentId, contactId: ref.contact_id, threadId: ref.thread_id, isTestMode: true, history: replay.history, message: replay.message }),
  });
  let res = await call();
  let out = await res.json().catch(() => ({}));
  const wait = rateLimitWaitMs(out);
  if (wait != null) {
    await new Promise((r) => setTimeout(r, Math.min(wait + 1000, MAX_RATE_LIMIT_WAIT_MS)));
    res = await call();
    out = await res.json().catch(() => ({}));
  }
  return { res, out };
}

/** Atendimento: o que o agente responderia no lugar da última resposta da equipe. */
async function testSupport(admin: Admin, orgId: string, agentId: string, agentTools: string[], ref: CaseRef, callerAuth: string) {
  const before = await conversationBefore(admin, orgId, agentTools, ref);
  const replay = buildReplay(before);
  const base = { thread: ref.thread_id.slice(0, 8), at: ref.calc_at, team_reply: String(ref.team_text).slice(0, 600) };
  if (!replay) return { ...base, outcome: "erro", error: "sem mensagem do cliente antes da resposta" };
  const { res, out } = await callAgent(agentId, ref, replay, callerAuth);
  if (!res.ok || out?.success === false) return { ...base, outcome: "erro", error: String(out?.error ?? `HTTP ${res.status}`) };
  const bubbles: string[] = Array.isArray(out.bubbles) ? out.bubbles : [];
  const tools: string[] = Array.isArray(out.toolsExecuted) ? out.toolsExecuted : [];
  return {
    ...base,
    client_message: replay.message.slice(0, 400),
    agent_reply: bubbles.join("\n\n").slice(0, 800),
    tools,
    outcome: tools.includes("transfer_to_human") ? "passou_para_pessoa" : "respondeu",
  };
}

async function status(admin: Admin, orgId: string, runId: string) {
  const { data } = await admin.from("agent_backtest_runs").select("*").eq("id", runId).eq("organization_id", orgId).maybeSingle();
  if (!data) throw new HttpError(404, "run_not_found");
  return json(data);
}

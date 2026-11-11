// conversation-analysis: análise da conversa inteira, dentro da org e com a chave Claude da org.
// Vale para todas as orgs. Só administrador da org chama. Sem chave Claude da org, não roda.
//
// Ações (POST, body.action):
//  - start:  escolhe a amostra (ganhas e perdidas), monta cada conversa completa e manda em lote.
//            Com dry_run: true só devolve a contagem e o custo estimado, sem gastar nada.
//            Recusa se o custo estimado passar de budget_usd.
//  - poll:   confere o lote; quando termina, grava cada análise e o custo real.
//  - report: com as análises prontas, pede o relatório ganhas x perdidas (também em lote).
//  - cancel: cancela um lote ainda em andamento.
//  - status: devolve o estado da rodada.
import { corsHeaders, json } from "../_shared/intelligence/byok-shared.ts";
import { requireOrgAdmin } from "../_shared/intelligence/authz.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { byokBudgetExceeded, markByokInvalid, readSecretPayload } from "../_shared/intelligence/resolve-provider.ts";
import { pickTextAiCredential, type TextAiCredential } from "../_shared/intelligence/text-ai-credential.ts";
import { logAiUsage } from "../_shared/intelligence/log-usage.ts";
import { normalizeProfile } from "../_shared/intelligence/analysis-profile.ts";
import {
  batchCostUsd,
  buildBatchItem,
  buildConversationSystemPrompt,
  buildConversationUserPrompt,
  buildReportSystemPrompt,
  buildReportUserPrompt,
  CONVERSATION_ANALYSIS_VERSION,
  CONVERSATION_SCHEMA,
  type ConversationMessage,
  DEFAULT_MODEL,
  estimateTokens,
  formatTranscript,
  parseBatchResultLine,
  REPORT_ANALYSIS_VERSION,
  REPORT_SCHEMA,
  type ReportInputRow,
} from "../_shared/intelligence/conversation-analysis.ts";

const ANTHROPIC = "https://api.anthropic.com/v1/messages/batches";
const ANTHROPIC_VERSION = "2023-06-01";
const CONVERSATION_MAX_TOKENS = 16_000;
const REPORT_MAX_TOKENS = 64_000;
/** Saída esperada por conversa, contando o raciocínio do modelo. Usada só para estimar o custo. */
const EXPECTED_OUTPUT_TOKENS = 3_000;
const EXPECTED_REPORT_OUTPUT_TOKENS = 20_000;
const SYSTEM_PROMPT_TOKENS = 1_200;
const MAX_PER_OUTCOME = 500;
const MAX_BUDGET_USD = 200;
const PAGE = 1000;

type Admin = any;

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
      case "start": return await start(admin, orgId, auth.userId, body);
      case "poll": return await poll(admin, orgId, String(body.run_id ?? ""));
      case "report": return await report(admin, orgId, auth.userId, body);
      case "cancel": return await cancel(admin, orgId, String(body.run_id ?? ""));
      case "status": return await status(admin, orgId, String(body.run_id ?? ""));
      default: return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
    console.error("[conversation-analysis] erro", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});

class HttpError extends Error {
  constructor(public status: number, public code: string, message = code) { super(message); }
}

// ---------- Chave Claude da org ----------

interface ClaudeKey { apiKey: string; credential: TextAiCredential }

async function claudeKey(admin: Admin, orgId: string): Promise<ClaudeKey> {
  const { data: rows } = await admin.from("organization_integrations")
    .select("config_values, integration:admin_integrations!inner(slug)")
    .eq("organization_id", orgId).eq("is_enabled", true)
    .eq("integration.slug", "claude-ai");
  const legacy = (rows ?? []).map((r: any) => ({ slug: r.integration.slug, config_values: r.config_values }));
  const secrets = await readSecretPayload(admin, orgId) as Record<string, any>;
  // Só Claude: o lote e o esquema de saída usados aqui são da Anthropic.
  const credential = pickTextAiCredential(secrets.anthropic ? { anthropic: secrets.anthropic } : {}, legacy);
  if (!credential) {
    throw new HttpError(409, "no_claude_key", "A análise da conversa usa a chave do Claude da organização. Cadastre em Configurações > Provedores de IA.");
  }
  if (credential.kind === "byok") {
    const budget = Number(credential.entry.monthly_budget_usd ?? 0);
    if (budget > 0 && await byokBudgetExceeded(admin, orgId, "anthropic", budget)) {
      throw new HttpError(402, "budget_exceeded", "O limite mensal da chave de IA desta organização foi atingido.");
    }
    return { apiKey: await decryptSecret(credential.entry.api_key_encrypted!), credential };
  }
  return { apiKey: credential.config.api_key, credential };
}

async function anthropic(key: ClaudeKey, orgId: string, admin: Admin, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { "x-api-key": key.apiKey, "anthropic-version": ANTHROPIC_VERSION, "Content-Type": "application/json" },
  });
  if (res.status === 401 || res.status === 403) {
    if (key.credential.kind === "byok") await markByokInvalid(admin, orgId, "anthropic", "invalid_key");
    throw new HttpError(424, "key_rejected", "A chave do Claude desta organização foi recusada.");
  }
  if (!res.ok) {
    console.error("[conversation-analysis] anthropic", res.status, (await res.text()).slice(0, 300));
    throw new HttpError(502, "ai_failure", "A Anthropic não aceitou o pedido. Tente de novo.");
  }
  return res;
}

async function price(admin: Admin, model: string) {
  const { data } = await admin.from("provider_pricing")
    .select("input_per_1k_usd, output_per_1k_usd")
    .eq("provider", "anthropic").eq("model", model)
    .order("effective_from", { ascending: false }).limit(1).maybeSingle();
  if (!data) throw new HttpError(400, "unknown_model_price", `Sem preço cadastrado para ${model}.`);
  return { input_per_1k_usd: Number(data.input_per_1k_usd), output_per_1k_usd: Number(data.output_per_1k_usd) };
}

async function profile(admin: Admin, orgId: string) {
  const { data } = await admin.from("intelligence_settings").select("analysis_profile").eq("organization_id", orgId).maybeSingle();
  return normalizeProfile(data?.analysis_profile);
}

async function userNames(admin: Admin, ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const names: Record<string, string> = {};
  for (let i = 0; i < unique.length; i += 200) {
    const { data } = await admin.from("users").select("id, full_name").in("id", unique.slice(i, i + 200));
    for (const u of data ?? []) names[u.id] = u.full_name ?? "sem nome";
  }
  return names;
}

function budgetOf(body: any): number {
  const b = Number(body?.budget_usd);
  if (!Number.isFinite(b) || b <= 0 || b > MAX_BUDGET_USD) {
    throw new HttpError(400, "invalid_budget", `Informe budget_usd entre 0 e ${MAX_BUDGET_USD}.`);
  }
  return b;
}

// ---------- start ----------

async function start(admin: Admin, orgId: string, userId: string, body: any): Promise<Response> {
  const days = Math.min(365, Math.max(7, Number(body?.days ?? 120)));
  const won = Math.min(MAX_PER_OUTCOME, Math.max(0, Number(body?.won ?? 200)));
  const lost = Math.min(MAX_PER_OUTCOME, Math.max(0, Number(body?.lost ?? 200)));
  const seed = String(body?.seed ?? "conversation-v1").slice(0, 40);
  const model = String(body?.model ?? DEFAULT_MODEL);
  const effort = body?.effort === "high" || body?.effort === "low" ? body.effort : "medium";
  const dryRun = body?.dry_run === true;
  const budget = budgetOf(body);

  const key = await claudeKey(admin, orgId);
  const unitPrice = await price(admin, model);

  const { data: candidates, error: candErr } = await admin.rpc("conversation_analysis_candidates", {
    p_org: orgId, p_days: days, p_won: won, p_lost: lost, p_seed: seed,
  });
  if (candErr) throw new Error(`candidates: ${candErr.message}`);
  const picked = (candidates ?? []) as any[];
  if (!picked.length) throw new HttpError(404, "no_conversations", "Nenhuma conversa fechada com troca real de mensagens no período.");

  const messagesByOpp = await loadMessages(admin, orgId, picked.map((c) => c.opportunity_id));
  const names = await userNames(admin, [
    ...picked.map((c) => c.owner_user_id),
    ...[...messagesByOpp.values()].flat().map((m) => m.sender_user_id ?? ""),
  ]);
  const system = buildConversationSystemPrompt(await profile(admin, orgId));

  const items = picked.map((c) => {
    const { text, stats } = formatTranscript(messagesByOpp.get(c.opportunity_id) ?? [], names);
    const user = buildConversationUserPrompt({
      opportunity_id: c.opportunity_id, outcome: c.outcome, owner_name: names[c.owner_user_id] ?? null,
      stage_before_close: c.stage_before_close, opened_at: c.opened_at, closed_at: c.closed_at,
    }, text);
    return { c, stats, user };
  });

  const promptTokens = items.reduce((s, i) => s + estimateTokens(i.user.length) + SYSTEM_PROMPT_TOKENS, 0);
  const estimated = batchCostUsd(unitPrice, promptTokens, items.length * EXPECTED_OUTPUT_TOKENS);
  const summary = {
    conversations: items.length,
    won: items.filter((i) => i.c.outcome === "won").length,
    lost: items.filter((i) => i.c.outcome === "lost").length,
    messages: items.reduce((s, i) => s + i.stats.message_count, 0),
    audios: items.reduce((s, i) => s + i.stats.audio_count, 0),
    estimated_prompt_tokens: promptTokens,
    estimated_cost_usd: Number(estimated.toFixed(2)),
    budget_usd: budget,
    model,
  };
  if (dryRun) return json({ ok: true, dry_run: true, ...summary });
  if (estimated > budget) {
    throw new HttpError(402, "over_budget", `Custo estimado US$ ${estimated.toFixed(2)} passa do teto de US$ ${budget}.`);
  }

  const { data: run, error: runErr } = await admin.from("conversation_analysis_runs").insert({
    organization_id: orgId, kind: "conversations", model, analysis_version: CONVERSATION_ANALYSIS_VERSION,
    params: { days, won, lost, seed, effort }, budget_usd: budget, estimated_cost_usd: estimated,
    counts: summary, created_by: userId,
  }).select("id").single();
  if (runErr) throw new Error(`run: ${runErr.message}`);

  const rows = items.map((i) => ({
    organization_id: orgId, run_id: run.id, opportunity_id: i.c.opportunity_id, contact_id: i.c.contact_id,
    outcome: i.c.outcome, owner_user_id: i.c.owner_user_id, stage_before_close: i.c.stage_before_close,
    opened_at: i.c.opened_at, closed_at: i.c.closed_at, ...i.stats,
    analysis_version: CONVERSATION_ANALYSIS_VERSION, model,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from("conversation_analyses").insert(rows.slice(i, i + 200));
    if (error) throw new Error(`analyses: ${error.message}`);
  }

  const requests = items.map((i) => buildBatchItem({
    customId: i.c.opportunity_id, model, system, user: i.user, schema: CONVERSATION_SCHEMA, effort,
    maxTokens: CONVERSATION_MAX_TOKENS,
  }));
  return await submit(admin, orgId, key, run.id, requests, summary);
}

async function loadMessages(admin: Admin, orgId: string, ids: string[]): Promise<Map<string, ConversationMessage[]>> {
  const out = new Map<string, ConversationMessage[]>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin.rpc("conversation_analysis_messages", { p_org: orgId, p_opportunity_ids: chunk })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`messages: ${error.message}`);
      for (const m of data ?? []) {
        const list = out.get(m.opportunity_id) ?? [];
        list.push(m);
        out.set(m.opportunity_id, list);
      }
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

async function submit(admin: Admin, orgId: string, key: ClaudeKey, runId: string, requests: unknown[], extra: unknown): Promise<Response> {
  try {
    const res = await anthropic(key, orgId, admin, ANTHROPIC, { method: "POST", body: JSON.stringify({ requests }) });
    const batch = await res.json();
    await admin.from("conversation_analysis_runs").update({
      status: "submitted", provider_batch_id: batch.id, submitted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", runId);
    return json({ ok: true, run_id: runId, batch_status: batch.processing_status, ...(extra as object) });
  } catch (e) {
    await admin.from("conversation_analysis_runs").update({
      status: "failed", error: (e as Error).message.slice(0, 500), finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", runId);
    throw e;
  }
}

// ---------- poll ----------

async function loadRun(admin: Admin, orgId: string, runId: string) {
  if (!runId) throw new HttpError(400, "missing_run_id");
  const { data } = await admin.from("conversation_analysis_runs").select("*").eq("id", runId).eq("organization_id", orgId).maybeSingle();
  if (!data) throw new HttpError(404, "run_not_found");
  return data;
}

async function poll(admin: Admin, orgId: string, runId: string): Promise<Response> {
  const run = await loadRun(admin, orgId, runId);
  if (run.status !== "submitted") return json({ ok: true, run_id: run.id, status: run.status, counts: run.counts, cost_usd: run.cost_usd });

  const key = await claudeKey(admin, orgId);
  const batch = await (await anthropic(key, orgId, admin, `${ANTHROPIC}/${run.provider_batch_id}`)).json();
  if (batch.processing_status !== "ended") {
    return json({ ok: true, run_id: run.id, status: "submitted", batch_status: batch.processing_status, request_counts: batch.request_counts });
  }

  const text = await (await anthropic(key, orgId, admin, batch.results_url)).text();
  const outcomes = text.split("\n").filter((l) => l.trim()).map((l) => parseBatchResultLine(JSON.parse(l)));
  const unitPrice = await price(admin, run.model);
  let promptTokens = 0;
  let completionTokens = 0;
  let failed = 0;
  let reportResult: unknown = null;

  for (const o of outcomes) {
    promptTokens += o.promptTokens;
    completionTokens += o.completionTokens;
    if (!o.ok) failed++;
    if (run.kind === "report") {
      reportResult = o.ok ? o.data : null;
      continue;
    }
    await admin.from("conversation_analyses").update({
      status: o.ok ? "done" : "failed",
      analysis: o.ok ? o.data : null,
      error: o.ok ? null : o.error,
      prompt_tokens: o.promptTokens,
      completion_tokens: o.completionTokens,
      cost_usd: batchCostUsd(unitPrice, o.promptTokens, o.completionTokens),
      updated_at: new Date().toISOString(),
    }).eq("run_id", run.id).eq("opportunity_id", o.customId);
  }

  const cost = batchCostUsd(unitPrice, promptTokens, completionTokens);
  const allFailed = outcomes.length > 0 && failed === outcomes.length;
  await admin.from("conversation_analysis_runs").update({
    status: allFailed ? "failed" : "done",
    cost_usd: cost, prompt_tokens: promptTokens, completion_tokens: completionTokens,
    counts: { ...(run.counts ?? {}), done: outcomes.length - failed, failed },
    result: run.kind === "report" ? reportResult : null,
    error: allFailed ? "all_requests_failed" : null,
    finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", run.id);

  await logAiUsage(admin, {
    organization_id: orgId,
    user_id: run.created_by,
    provider: "anthropic",
    model: run.model,
    source: "customer_key",
    action: run.kind === "report" ? "conversation_analysis_report" : "conversation_analysis",
    integration_slug: key.credential.slug,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    estimated_cost_usd: cost,
    entity_type: "conversation_analysis_run",
    entity_id: run.id,
  });

  return json({ ok: true, run_id: run.id, status: allFailed ? "failed" : "done", done: outcomes.length - failed, failed, cost_usd: cost });
}

// ---------- report ----------

async function report(admin: Admin, orgId: string, userId: string, body: any): Promise<Response> {
  const parent = await loadRun(admin, orgId, String(body?.run_id ?? ""));
  if (parent.kind !== "conversations" || parent.status !== "done") {
    throw new HttpError(409, "run_not_ready", "O relatório precisa de uma rodada de conversas já concluída.");
  }
  const budget = budgetOf(body);
  const model = String(body?.model ?? parent.model);
  const dryRun = body?.dry_run === true;

  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from("conversation_analyses")
      .select("opportunity_id, outcome, owner_user_id, stage_before_close, opened_at, closed_at, message_count, analysis")
      .eq("run_id", parent.id).eq("status", "done").order("opportunity_id").range(from, from + PAGE - 1);
    if (error) throw new Error(`report rows: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  if (rows.length < 10) throw new HttpError(409, "too_few_analyses", "Poucas análises prontas para comparar.");

  const names = await userNames(admin, rows.map((r) => r.owner_user_id));
  const input: ReportInputRow[] = rows.map((r) => ({
    opportunity_id: r.opportunity_id, outcome: r.outcome, owner_name: names[r.owner_user_id] ?? null,
    stage_before_close: r.stage_before_close, message_count: r.message_count, analysis: r.analysis,
    days_to_close: Math.max(0, (new Date(r.closed_at).getTime() - new Date(r.opened_at).getTime()) / 86_400_000),
  }));
  const prof = await profile(admin, orgId);
  const system = buildReportSystemPrompt(prof);
  const user = buildReportUserPrompt(input);

  const key = await claudeKey(admin, orgId);
  const unitPrice = await price(admin, model);
  const promptTokens = estimateTokens(user.length) + SYSTEM_PROMPT_TOKENS;
  const estimated = batchCostUsd(unitPrice, promptTokens, EXPECTED_REPORT_OUTPUT_TOKENS);
  const summary = { analyses: rows.length, estimated_prompt_tokens: promptTokens, estimated_cost_usd: Number(estimated.toFixed(2)), budget_usd: budget, model };
  if (dryRun) return json({ ok: true, dry_run: true, ...summary });
  if (estimated > budget) throw new HttpError(402, "over_budget", `Custo estimado US$ ${estimated.toFixed(2)} passa do teto de US$ ${budget}.`);

  const { data: run, error } = await admin.from("conversation_analysis_runs").insert({
    organization_id: orgId, kind: "report", parent_run_id: parent.id, model, analysis_version: REPORT_ANALYSIS_VERSION,
    params: { effort: "high" }, budget_usd: budget, estimated_cost_usd: estimated, counts: summary, created_by: userId,
  }).select("id").single();
  if (error) throw new Error(`report run: ${error.message}`);

  const request = buildBatchItem({
    customId: "report", model, system, user, schema: REPORT_SCHEMA, effort: "high", maxTokens: REPORT_MAX_TOKENS,
  });
  return await submit(admin, orgId, key, run.id, [request], summary);
}

// ---------- cancel / status ----------

async function cancel(admin: Admin, orgId: string, runId: string): Promise<Response> {
  const run = await loadRun(admin, orgId, runId);
  if (run.status !== "submitted") return json({ ok: true, run_id: run.id, status: run.status });
  const key = await claudeKey(admin, orgId);
  await anthropic(key, orgId, admin, `${ANTHROPIC}/${run.provider_batch_id}/cancel`, { method: "POST" });
  // O lote cancelado ainda termina com o que já foi feito; o poll grava e cobra só isso.
  return json({ ok: true, run_id: run.id, status: "canceling" });
}

async function status(admin: Admin, orgId: string, runId: string): Promise<Response> {
  const run = await loadRun(admin, orgId, runId);
  return json({
    ok: true, run_id: run.id, kind: run.kind, status: run.status, model: run.model, counts: run.counts,
    estimated_cost_usd: run.estimated_cost_usd, cost_usd: run.cost_usd, error: run.error,
  });
}

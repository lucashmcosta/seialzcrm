// analyze-message (v2 BYOK)
// Chamado pelo intelligence-worker. Resolve provider (managed Lovable Gateway ou BYOK OpenAI),
// faz tool-call para extrair análise estruturada, grava em message_analyses + sales_events,
// loga em ai_usage_logs com source/cost.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  ANALYSIS_SYSTEM_PROMPT,
  ANALYSIS_TOOL,
  ANALYSIS_VERSION,
  type MessageAnalysisPayload,
} from "../_shared/intelligence/analyze-prompt.ts";
import {
  getManagedProvider,
  markByokInvalid,
  ProviderResolutionError,
  resolveProvider,
} from "../_shared/intelligence/resolve-provider.ts";
import { sanitizeProviderError, safeLog } from "../_shared/intelligence/sanitize.ts";
import { logAiUsage } from "../_shared/intelligence/log-usage.ts";
import { estimateTextCostUsd } from "../_shared/intelligence/pricing.ts";
import { getIntelligenceSettings, shouldAnalyze } from "../_shared/intelligence/settings.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("INTELLIGENCE_WORKER_TOKEN")!;

function endpointFor(provider: string): string {
  if (provider === "openai") return "https://api.openai.com/v1/chat/completions";
  // managed gemini through Lovable Gateway (OpenAI-compatible)
  return "https://ai.gateway.lovable.dev/v1/chat/completions";
}

function modelFor(provider: string, model: string): string {
  // Lovable gateway expects "google/gemini-2.5-flash" style; OpenAI expects raw model name.
  if (provider === "openai") return model;
  if (provider === "gemini") return model.startsWith("google/") ? model : `google/${model}`;
  return model;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-worker-token") !== WORKER_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { message_id?: string; organization_id?: string; job_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { message_id, organization_id, job_id } = body;
  if (!message_id || !organization_id) return json({ error: "missing_params" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: existing } = await admin
    .from("message_analyses")
    .select("id")
    .eq("message_id", message_id)
    .eq("analysis_version", ANALYSIS_VERSION)
    .maybeSingle();
  if (existing) return json({ ok: true, skipped: "already_analyzed" });

  const { data: msg, error: msgErr } = await admin
    .from("messages")
    .select("id, organization_id, thread_id, direction, content, media_type, created_at")
    .eq("id", message_id)
    .single();
  if (msgErr || !msg) return json({ error: "message_not_found", detail: msgErr?.message }, 404);
  if (msg.organization_id !== organization_id) return json({ error: "org_mismatch" }, 403);
  if (!msg.content || msg.content.trim().length < 2) {
    return json({ ok: true, skipped: "no_content" });
  }

  // Settings gating; derive contact/opportunity from thread
  const settings = await getIntelligenceSettings(admin, organization_id);
  const { data: thr } = await admin
    .from("message_threads")
    .select("channel, opportunity_id, contact_id")
    .eq("id", msg.thread_id).maybeSingle();
  const contactId: string | null = thr?.contact_id ?? null;
  let oppId: string | null = thr?.opportunity_id ?? null;
  if (!oppId && contactId) {
    const { data: opp } = await admin
      .from("opportunities")
      .select("id, status")
      .eq("contact_id", contactId)
      .is("deleted_at", null)
      .not("status", "in", "(won,lost,abandoned)")
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();
    if (opp) oppId = opp.id;
  }
  let opportunityIsOpen: boolean | null = null;
  if (oppId) {
    const { data: opp } = await admin
      .from("opportunities").select("status").eq("id", oppId).maybeSingle();
    opportunityIsOpen = opp ? opp.status === "open" : null;
  }
  const gate = shouldAnalyze(settings, {
    direction: (msg.direction as any) ?? null,
    opportunityIsOpen,
    channel: thr?.channel ?? null,
    isInternalNote: false,
  });
  if (!gate.allow) return json({ ok: true, skipped: gate.reason });

  let provider;
  try {
    provider = await resolveProvider(admin, organization_id, "chat");
  } catch (e) {
    if (e instanceof ProviderResolutionError) {
      return json({ error: e.code }, e.code === "no_provider" ? 503 : 402);
    }
    throw e;
  }

  const { data: ctx } = await admin
    .from("messages")
    .select("direction, content, created_at")
    .eq("thread_id", msg.thread_id)
    .neq("id", msg.id)
    .order("created_at", { ascending: false })
    .limit(4);

  const conversation = (ctx ?? []).reverse()
    .map((m) => `[${m.direction}] ${(m.content ?? "").slice(0, 280)}`)
    .join("\n");

  const userPrompt = `CONVERSA ANTERIOR (mais antiga -> mais recente):
${conversation || "(sem histórico)"}

MENSAGEM A ANALISAR:
[${msg.direction}] ${msg.content.slice(0, 2000)}`;

  const callOnce = async (p: typeof provider) => {
    const r = await fetch(endpointFor(p.provider), {
      method: "POST",
      headers: { Authorization: `Bearer ${p.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelFor(p.provider, p.model),
        messages: [
          { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: "function", function: { name: "record_message_analysis" } },
      }),
    });
    if (!r.ok) return { ok: false as const, status: r.status, rawBody: await r.text() };
    return { ok: true as const, json: await r.json() };
  };

  let result = await callOnce(provider);
  let usedSource: "managed" | "customer_key" | "managed_fallback" = provider.source;

  if (!result.ok) {
    const err = sanitizeProviderError(result.status, result.rawBody);
    safeLog("[analyze-message] provider error", { provider: provider.provider, kind: err.kind, status: err.status });

    if (provider.source === "customer_key" && err.kind === "invalid_key") {
      await markByokInvalid(admin, organization_id, provider.provider, err.code ?? "invalid_key");
      await admin.from("sales_events").insert({
        organization_id,
        event_type: "byok_key_invalid",
        payload: { provider: provider.provider, capability: "chat" },
        occurred_at: new Date().toISOString(),
      });
      if (provider.fallbackToManaged) {
        const managed = getManagedProvider("chat");
        result = await callOnce(managed);
        usedSource = "managed_fallback";
        provider = managed;
      } else {
        return json({ error: "byok_invalid", provider: provider.provider }, 424);
      }
    } else if (provider.source === "customer_key" && err.kind === "rate_limit" && provider.fallbackOnRateLimit) {
      const managed = getManagedProvider("chat");
      result = await callOnce(managed);
      usedSource = "managed_fallback";
      provider = managed;
    }
  }

  if (!result.ok) {
    const err = sanitizeProviderError(result.status);
    return json({ error: "ai_failure", kind: err.kind }, err.kind === "transient" || err.kind === "rate_limit" ? 502 : 400);
  }

  const aiJson = result.json;
  const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) return json({ error: "no_tool_call" }, 502);

  let analysis: MessageAnalysisPayload;
  try { analysis = JSON.parse(toolCall.function.arguments); }
  catch { return json({ error: "invalid_analysis_json" }, 502); }

  const promptTokens = Number(aiJson?.usage?.prompt_tokens ?? 0);
  const completionTokens = Number(aiJson?.usage?.completion_tokens ?? 0);
  const totalTokens = Number(aiJson?.usage?.total_tokens ?? (promptTokens + completionTokens));

  await admin.from("message_analyses").upsert({
    message_id: msg.id,
    organization_id: msg.organization_id,
    analysis_version: ANALYSIS_VERSION,
    model: `${provider.provider}/${provider.model}`,
    sentiment: analysis.sentiment,
    intent: analysis.intent,
    objection_type: analysis.objection_type,
    urgency_score: analysis.urgency_score,
    buying_signals: analysis.buying_signals,
    requires_human: analysis.requires_human,
    language_complexity: analysis.language_complexity,
    reasoning: analysis.reasoning,
    tokens_used: totalTokens,
    raw_response: aiJson,
  }, { onConflict: "message_id,analysis_version" });

  await admin.from("messages").update({
    sentiment: analysis.sentiment,
    intent: analysis.intent,
    urgency_score: analysis.urgency_score,
    ai_analyzed_at: new Date().toISOString(),
    ai_analysis_version: ANALYSIS_VERSION,
  }).eq("id", msg.id);

  const events: Array<Record<string, unknown>> = [];
  const base = {
    organization_id: msg.organization_id,
    contact_id: msg.contact_id,
    opportunity_id: msg.opportunity_id,
    message_id: msg.id,
    occurred_at: msg.created_at,
  };
  if (analysis.objection_type) events.push({ ...base, event_type: "objection_detected", payload: { type: analysis.objection_type, intent: analysis.intent } });
  if (analysis.buying_signals?.length) events.push({ ...base, event_type: "buying_signal_detected", payload: { signals: analysis.buying_signals } });
  if (analysis.requires_human) events.push({ ...base, event_type: "human_handoff_suggested", payload: { reason: analysis.reasoning, urgency: analysis.urgency_score } });
  if (analysis.intent === "complaint" || analysis.sentiment === "very_negative") {
    events.push({ ...base, event_type: "negative_sentiment_detected", payload: { sentiment: analysis.sentiment, intent: analysis.intent } });
  }
  if (events.length) await admin.from("sales_events").insert(events);

  const cost = await estimateTextCostUsd(admin, provider.provider, provider.model, promptTokens, completionTokens);
  await logAiUsage(admin, {
    organization_id,
    provider: provider.provider,
    model: provider.model,
    source: usedSource,
    action: "analyze_message",
    integration_slug: provider.provider,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: cost,
    entity_type: "message",
    entity_id: msg.id,
    job_id: job_id ?? null,
  });

  return json({ ok: true, version: ANALYSIS_VERSION, events: events.length, source: usedSource });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
}

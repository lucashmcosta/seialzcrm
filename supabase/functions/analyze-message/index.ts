// analyze-message: chamado pelo intelligence-worker.
// Recebe { job_id, organization_id, message_id }.
// Carrega a mensagem, chama Lovable AI Gateway (Gemini Flash, JSON via tool-call),
// grava em message_analyses, denormaliza campos quentes em messages, emite sales_events.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  ANALYSIS_SYSTEM_PROMPT,
  ANALYSIS_TOOL,
  ANALYSIS_VERSION,
  type MessageAnalysisPayload,
} from "../_shared/intelligence/analyze-prompt.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("INTELLIGENCE_WORKER_TOKEN")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-flash";

Deno.serve(async (req) => {
  if (req.headers.get("x-worker-token") !== WORKER_TOKEN) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let body: { message_id?: string; organization_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const { message_id, organization_id } = body;
  if (!message_id || !organization_id) return json({ error: "missing_params" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Idempotência: já analisado nesta versão? skip.
  const { data: existing } = await supabase
    .from("message_analyses")
    .select("id")
    .eq("message_id", message_id)
    .eq("analysis_version", ANALYSIS_VERSION)
    .maybeSingle();
  if (existing) return json({ ok: true, skipped: "already_analyzed" });

  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .select("id, organization_id, thread_id, direction, content, media_type, created_at, contact_id, opportunity_id")
    .eq("id", message_id)
    .single();
  if (msgErr || !msg) return json({ error: "message_not_found" }, 404);
  if (msg.organization_id !== organization_id) return json({ error: "org_mismatch" }, 403);

  // Skip vazias / sem texto (áudio sem transcrição ainda).
  if (!msg.content || msg.content.trim().length < 2) {
    return json({ ok: true, skipped: "no_content" });
  }

  // Contexto leve: últimas 4 mensagens da mesma thread (excluindo a atual).
  const { data: ctx } = await supabase
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

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "function", function: { name: "record_message_analysis" } },
    }),
  });

  if (!aiRes.ok) {
    const errBody = await aiRes.text();
    return json({ error: "ai_failure", status: aiRes.status, body: errBody.slice(0, 500) }, aiRes.status === 429 || aiRes.status >= 500 ? 502 : 400);
  }

  const aiJson = await aiRes.json();
  const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) return json({ error: "no_tool_call" }, 502);

  let analysis: MessageAnalysisPayload;
  try { analysis = JSON.parse(toolCall.function.arguments); }
  catch { return json({ error: "invalid_analysis_json" }, 502); }

  const tokensUsed = aiJson?.usage?.total_tokens ?? null;

  // Upsert message_analyses (unique em message_id+analysis_version).
  const { error: insErr } = await supabase.from("message_analyses").upsert({
    message_id: msg.id,
    organization_id: msg.organization_id,
    analysis_version: ANALYSIS_VERSION,
    model: MODEL,
    sentiment: analysis.sentiment,
    intent: analysis.intent,
    objection_type: analysis.objection_type,
    urgency_score: analysis.urgency_score,
    buying_signals: analysis.buying_signals,
    requires_human: analysis.requires_human,
    language_complexity: analysis.language_complexity,
    reasoning: analysis.reasoning,
    tokens_used: tokensUsed,
    raw_response: aiJson,
  }, { onConflict: "message_id,analysis_version" });
  if (insErr) return json({ error: "insert_analysis_failed", details: insErr.message }, 500);

  // Denormalização: campos quentes em messages.
  await supabase.from("messages").update({
    sentiment: analysis.sentiment,
    intent: analysis.intent,
    urgency_score: analysis.urgency_score,
    ai_analyzed_at: new Date().toISOString(),
    ai_analysis_version: ANALYSIS_VERSION,
  }).eq("id", msg.id);

  // Eventos derivados em sales_events.
  const events: Array<Record<string, unknown>> = [];
  const base = {
    organization_id: msg.organization_id,
    contact_id: msg.contact_id,
    opportunity_id: msg.opportunity_id,
    message_id: msg.id,
    occurred_at: msg.created_at,
  };

  if (analysis.objection_type) {
    events.push({ ...base, event_type: "objection_detected", payload: { type: analysis.objection_type, intent: analysis.intent } });
  }
  if (analysis.buying_signals?.length) {
    events.push({ ...base, event_type: "buying_signal_detected", payload: { signals: analysis.buying_signals } });
  }
  if (analysis.requires_human) {
    events.push({ ...base, event_type: "human_handoff_suggested", payload: { reason: analysis.reasoning, urgency: analysis.urgency_score } });
  }
  if (analysis.intent === "complaint" || analysis.sentiment === "very_negative") {
    events.push({ ...base, event_type: "negative_sentiment_detected", payload: { sentiment: analysis.sentiment, intent: analysis.intent } });
  }
  if (events.length) await supabase.from("sales_events").insert(events);

  return json({ ok: true, version: ANALYSIS_VERSION, events: events.length });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
}

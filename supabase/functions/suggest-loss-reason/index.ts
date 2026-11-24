// Sugere o motivo de perda lendo a conversa do contato. Chamada pela tela "Marcar como perdida".
// Usa só a chave de IA da própria org (openOrgAi); sem chave, sem cadastro ou sem conversa devolve suggestion null.
// Grava a sugestão em opportunity_loss_suggestions para medir o acerto quando a perda for gravada.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { openOrgAi, OrgAiError, orgAiErrorResponse } from "../_shared/intelligence/org-ai.ts";
import { effectiveContent } from "../_shared/intelligence/audio-content.ts";
import {
  buildMessages, MIN_CONFIDENCE, parseSuggestion, transcriptText,
  type ConversationLine, type LossOptions,
} from "../_shared/loss-suggestion.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_MESSAGES = 80;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const orgId = typeof body?.organization_id === "string" ? body.organization_id : "";
  const oppId = typeof body?.opportunity_id === "string" ? body.opportunity_id : "";
  if (!oppId) return json({ error: "missing_opportunity_id" }, 400);

  // Antes de gastar IA: a org pode ter desligado a sugestão.
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (orgId) {
    const { data: s } = await service.from("opportunity_loss_settings").select("ai_suggest").eq("organization_id", orgId).maybeSingle();
    if (s && s.ai_suggest === false) return json({ suggestion: null, reason: "disabled" });
  }

  const gate = await openOrgAi(req, orgId, "suggest_loss_reason", cors);
  if (!gate.ok) {
    // Sem chave de IA não é erro para a tela: só não há sugestão.
    if (gate.response.status === 409) return json({ suggestion: null, reason: "no_ai_key" });
    return gate.response;
  }
  const { ai, admin, userId } = gate;

  // A pessoa precisa enxergar a oportunidade pelas regras de acesso dela (RLS), não só ser da org.
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization")! } },
  });
  const { data: visible } = await asUser.from("opportunities").select("id").eq("id", oppId).eq("organization_id", orgId).maybeSingle();
  if (!visible) return json({ error: "opportunity_not_found" }, 404);

  const { data: opp } = await admin.from("opportunities")
    .select("id, contact_id, status, pipeline_stage_id, stage:pipeline_stages(name)")
    .eq("id", oppId).eq("organization_id", orgId).is("deleted_at", null).maybeSingle();
  if (!opp) return json({ error: "opportunity_not_found" }, 404);

  const { data: rawOptions } = await admin.rpc("list_loss_reason_options_v1", { _organization_id: orgId });
  const options = (rawOptions ?? { reasons: [] }) as LossOptions;
  if (!options.reasons?.length) return json({ suggestion: null, reason: "no_catalog" });

  if (!opp.contact_id) return json({ suggestion: null, reason: "no_conversation" });
  const { data: threads } = await admin.from("message_threads").select("id")
    .eq("organization_id", orgId).eq("contact_id", opp.contact_id).is("merged_into_thread_id", null);
  const threadIds = (threads ?? []).map((t: any) => t.id);
  if (!threadIds.length) return json({ suggestion: null, reason: "no_conversation" });

  const { data: msgs } = await admin.from("messages")
    .select("id, direction, content, media_type, is_internal_note, created_at")
    .in("thread_id", threadIds).is("deleted_at", null)
    .order("created_at", { ascending: false }).limit(MAX_MESSAGES);
  const rows = (msgs ?? []).reverse();
  const audioIds = rows.filter((m: any) => (m.media_type ?? "").startsWith("audio")).map((m: any) => m.id);
  const heard = new Map<string, string>();
  if (audioIds.length) {
    const { data: t } = await admin.from("audio_transcriptions").select("message_id, transcript").in("message_id", audioIds);
    for (const a of t ?? []) if (a.transcript) heard.set(a.message_id, a.transcript);
  }
  const lines: ConversationLine[] = rows.map((m: any) => ({
    at: m.created_at,
    who: m.is_internal_note ? "nota" : m.direction === "inbound" ? "cliente" : "empresa",
    text: effectiveContent({ content: m.content, mediaType: m.media_type, transcript: heard.get(m.id) }).content,
  }));
  const transcript = transcriptText(lines);
  if (!transcript) return json({ suggestion: null, reason: "no_conversation" });

  let raw: string;
  try {
    raw = await ai(buildMessages(options, (opp as any).stage?.name ?? null, transcript) as any, { maxTokens: 400 });
  } catch (e) {
    if (e instanceof OrgAiError) return orgAiErrorResponse(e, cors);
    console.error("[suggest-loss-reason] ai error", e);
    return json({ error: "ai_failure" }, 502);
  }
  const suggestion = parseSuggestion(raw, options);

  const { data: saved, error } = await admin.from("opportunity_loss_suggestions").insert({
    organization_id: orgId,
    opportunity_id: oppId,
    reason_id: suggestion?.reasonId ?? null,
    detail_id: suggestion?.detailId ?? null,
    confidence: suggestion?.confidence ?? null,
    evidence: suggestion?.evidence || null,
    messages_read: lines.length,
    requested_by: userId,
  }).select("id").single();
  if (error) console.error("[suggest-loss-reason] save error", error.message);

  if (!suggestion || suggestion.confidence < MIN_CONFIDENCE) {
    return json({ suggestion: null, reason: "unclear", suggestion_id: saved?.id ?? null });
  }
  return json({
    suggestion: {
      id: saved?.id ?? null,
      reason_id: suggestion.reasonId,
      detail_id: suggestion.detailId,
      confidence: suggestion.confidence,
      evidence: suggestion.evidence,
    },
  });
});

// transcribe-audio (v2 BYOK)
// Chamado pelo intelligence-worker. Resolve provider (ElevenLabs/OpenAI),
// transcreve, grava em audio_transcriptions, loga em ai_usage_logs com source/cost.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  getManagedProvider,
  markByokInvalid,
  ProviderResolutionError,
  resolveProvider,
} from "../_shared/intelligence/resolve-provider.ts";
import { sanitizeProviderError, safeLog } from "../_shared/intelligence/sanitize.ts";
import { logAiUsage } from "../_shared/intelligence/log-usage.ts";
import { estimateAudioCostUsd } from "../_shared/intelligence/pricing.ts";
import { getIntelligenceSettings, shouldTranscribe } from "../_shared/intelligence/settings.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("INTELLIGENCE_WORKER_TOKEN")!;
const TRANSCRIPTION_VERSION = "scribe_v2-1";

Deno.serve(async (req) => {
  if (req.headers.get("x-worker-token") !== WORKER_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { message_id?: string; organization_id?: string; job_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { message_id, organization_id, job_id } = body;
  if (!message_id || !organization_id) return json({ error: "missing_params" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Idempotência
  const { data: existing } = await admin
    .from("audio_transcriptions")
    .select("id")
    .eq("message_id", message_id)
    .eq("version", TRANSCRIPTION_VERSION)
    .maybeSingle();
  if (existing) return json({ ok: true, skipped: "already_transcribed" });

  const { data: msg } = await admin
    .from("messages")
    .select("id, organization_id, media_urls, media_type, content, direction, thread_id")
    .eq("id", message_id).single();
  if (!msg) return json({ error: "message_not_found" }, 404);
  if (msg.organization_id !== organization_id) return json({ error: "org_mismatch" }, 403);
  const mediaUrl: string | null = Array.isArray(msg.media_urls) && msg.media_urls.length > 0
    ? (typeof msg.media_urls[0] === "string" ? msg.media_urls[0] : (msg.media_urls[0]?.url ?? null))
    : null;
  if (!mediaUrl) return json({ error: "no_media_url" }, 400);

  // Settings gating
  const settings = await getIntelligenceSettings(admin, organization_id);
  const { data: thread } = await admin
    .from("message_threads")
    .select("opportunity_id")
    .eq("id", msg.thread_id).maybeSingle();
  let opportunityIsOpen: boolean | null = null;
  if (thread?.opportunity_id) {
    const { data: opp } = await admin
      .from("opportunities")
      .select("status")
      .eq("id", thread.opportunity_id).maybeSingle();
    opportunityIsOpen = opp ? opp.status === "open" : null;
  }
  const gate = shouldTranscribe(settings, {
    senderIsLead: msg.direction === "inbound",
    opportunityIsOpen,
  });
  if (!gate.allow) return json({ ok: true, skipped: gate.reason });

  // Resolve provider with BYOK -> managed priority. No implicit fallback after a failure.
  let provider;
  try {
    provider = await resolveProvider(admin, organization_id, "transcription");
  } catch (e) {
    if (e instanceof ProviderResolutionError) {
      return json({ error: e.code }, e.code === "no_provider" ? 503 : 402);
    }
    throw e;
  }

  const audioRes = await fetch(mediaUrl);
  if (!audioRes.ok) {
    return json({ error: "media_download_failed", status: audioRes.status }, audioRes.status >= 500 ? 502 : 400);
  }
  const audioBlob = await audioRes.blob();

  const callOnce = async (
    p: typeof provider,
  ): Promise<{ ok: true; text: string; raw: any; durationSec: number } | { ok: false; status: number; rawBody: string }> => {
    if (p.provider === "elevenlabs") {
      const form = new FormData();
      form.append("file", audioBlob, "audio.ogg");
      form.append("model_id", p.model);
      form.append("language_code", "por");
      form.append("tag_audio_events", "false");
      form.append("diarize", "false");
      const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": p.apiKey },
        body: form,
      });
      if (!r.ok) return { ok: false, status: r.status, rawBody: await r.text() };
      const j = await r.json();
      return { ok: true, text: j?.text ?? "", raw: j, durationSec: Number(j?.audio_duration ?? 0) };
    }
    // openai whisper-1
    const form = new FormData();
    form.append("file", audioBlob, "audio.ogg");
    form.append("model", p.model);
    form.append("language", "pt");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${p.apiKey}` },
      body: form,
    });
    if (!r.ok) return { ok: false, status: r.status, rawBody: await r.text() };
    const j = await r.json();
    return { ok: true, text: j?.text ?? "", raw: j, durationSec: 0 };
  };

  let result = await callOnce(provider);
  let usedSource: "managed" | "customer_key" | "managed_fallback" = provider.source;

  if (!result.ok) {
    const err = sanitizeProviderError(result.status, result.rawBody);
    safeLog("[transcribe-audio] provider error", { provider: provider.provider, kind: err.kind, status: err.status });

    if (provider.source === "customer_key" && err.kind === "invalid_key") {
      await markByokInvalid(admin, organization_id, provider.provider, err.code ?? "invalid_key");
      await admin.from("sales_events").insert({
        organization_id,
        event_type: "byok_key_invalid",
        payload: { provider: provider.provider, capability: "transcription" },
        occurred_at: new Date().toISOString(),
      });
      if (provider.fallbackToManaged) {
        const managed = getManagedProvider("transcription");
        result = await callOnce(managed);
        usedSource = "managed_fallback";
        provider = managed;
      } else {
        return json({ error: "byok_invalid", provider: provider.provider }, 424);
      }
    } else if (provider.source === "customer_key" && err.kind === "rate_limit" && provider.fallbackOnRateLimit) {
      const managed = getManagedProvider("transcription");
      result = await callOnce(managed);
      usedSource = "managed_fallback";
      provider = managed;
    }
  }

  if (!result.ok) {
    const err = sanitizeProviderError(result.status);
    return json({ error: "transcription_failed", kind: err.kind }, err.kind === "transient" || err.kind === "rate_limit" ? 502 : 400);
  }

  const text = result.text;

  await admin.from("audio_transcriptions").upsert({
    message_id: msg.id,
    organization_id: msg.organization_id,
    version: TRANSCRIPTION_VERSION,
    provider: provider.provider,
    language: "por",
    transcript: text,
    raw_response: result.raw,
  }, { onConflict: "message_id,version" });

  if (!msg.content || msg.content.trim().length === 0) {
    await admin.from("messages").update({ content: text }).eq("id", msg.id);
  }

  await admin.from("intelligence_jobs").insert({
    organization_id: msg.organization_id,
    target_action: "intelligence.analyze_message",
    payload: { message_id: msg.id },
    idempotency_key: `analyze:${msg.id}:after_transcribe`,
  });

  const cost = await estimateAudioCostUsd(admin, provider.provider, provider.model, result.durationSec || 30);
  await logAiUsage(admin, {
    organization_id,
    provider: provider.provider,
    model: provider.model,
    source: usedSource,
    action: "transcribe_audio",
    integration_slug: provider.provider,
    estimated_cost_usd: cost,
    entity_type: "message",
    entity_id: msg.id,
    job_id: job_id ?? null,
  });

  return json({ ok: true, chars: text.length, source: usedSource });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
}

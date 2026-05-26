// transcribe-audio: chamado pelo intelligence-worker.
// Recebe { job_id, organization_id, message_id }.
// Baixa o áudio (URL no messages.media_url), envia para ElevenLabs Scribe (scribe_v2),
// grava em audio_transcriptions, atualiza messages.content (se vazio),
// e enfileira analyze_message para esta mensagem.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("INTELLIGENCE_WORKER_TOKEN")!;
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const TRANSCRIPTION_VERSION = "scribe_v2-1";

Deno.serve(async (req) => {
  if (req.headers.get("x-worker-token") !== WORKER_TOKEN) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let body: { message_id?: string; organization_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { message_id, organization_id } = body;
  if (!message_id || !organization_id) return json({ error: "missing_params" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Idempotência
  const { data: existing } = await supabase
    .from("audio_transcriptions")
    .select("id")
    .eq("message_id", message_id)
    .eq("version", TRANSCRIPTION_VERSION)
    .maybeSingle();
  if (existing) return json({ ok: true, skipped: "already_transcribed" });

  const { data: msg } = await supabase
    .from("messages")
    .select("id, organization_id, media_url, media_type, content")
    .eq("id", message_id).single();
  if (!msg) return json({ error: "message_not_found" }, 404);
  if (msg.organization_id !== organization_id) return json({ error: "org_mismatch" }, 403);
  if (!msg.media_url) return json({ error: "no_media_url" }, 400);

  // Baixa o áudio (URL já é proxy interno do Twilio neste projeto).
  const audioRes = await fetch(msg.media_url);
  if (!audioRes.ok) return json({ error: "media_download_failed", status: audioRes.status }, audioRes.status >= 500 ? 502 : 400);
  const audioBlob = await audioRes.blob();

  const form = new FormData();
  form.append("file", audioBlob, "audio.ogg");
  form.append("model_id", "scribe_v2");
  form.append("language_code", "por");
  form.append("tag_audio_events", "false");
  form.append("diarize", "false");

  const elRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY },
    body: form,
  });
  if (!elRes.ok) {
    const t = await elRes.text();
    return json({ error: "elevenlabs_failed", status: elRes.status, body: t.slice(0, 500) }, elRes.status >= 500 || elRes.status === 429 ? 502 : 400);
  }
  const tr = await elRes.json();
  const text: string = tr?.text ?? "";

  await supabase.from("audio_transcriptions").upsert({
    message_id: msg.id,
    organization_id: msg.organization_id,
    version: TRANSCRIPTION_VERSION,
    provider: "elevenlabs",
    language: "por",
    transcript: text,
    raw_response: tr,
  }, { onConflict: "message_id,version" });

  // Se content estava vazio (áudio puro), grava transcrição como conteúdo para análise.
  if (!msg.content || msg.content.trim().length === 0) {
    await supabase.from("messages").update({ content: text }).eq("id", msg.id);
  }

  // Enfileira análise comportamental agora que temos texto.
  await supabase.from("intelligence_jobs").insert({
    organization_id: msg.organization_id,
    target_action: "intelligence.analyze_message",
    payload: { message_id: msg.id },
    idempotency_key: `analyze:${msg.id}:after_transcribe`,
  });

  return json({ ok: true, chars: text.length });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
}

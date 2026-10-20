// telephony-transcribe-call
//
// Transcreve a gravação de uma LIGAÇÃO. O `transcribe-audio` que já existe é
// específico de mensagem (recebe message_id, escreve em audio_transcriptions,
// atualiza messages.content), então não serve aqui -- mas as peças internas
// servem e são reaproveitadas: resolveProvider, estimateAudioCostUsd e
// logAiUsage.
//
// Lê o áudio do Supabase Storage, não do Twilio: quando este job roda, o
// telephony-archive-recording já trouxe o arquivo e apagou de lá.
//
// Chamado pelo intelligence-worker com target_action
// "intelligence.transcribe_call".

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  ProviderResolutionError,
  resolveProvider,
} from "../_shared/intelligence/resolve-provider.ts";
import {
  safeLog,
  sanitizeProviderError,
} from "../_shared/intelligence/sanitize.ts";
import { logAiUsage } from "../_shared/intelligence/log-usage.ts";
import { estimateAudioCostUsd } from "../_shared/intelligence/pricing.ts";
import { isLikelyHallucination } from "../_shared/intelligence/analyze-prompt.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("INTELLIGENCE_WORKER_TOKEN")!;
const BUCKET = "call-recordings";
// Mesma política do transcribe-audio: BYOK estrito, sem cair para a chave
// gerenciada em áudio.
const STRICT_BYOK =
  (Deno.env.get("INTELLIGENCE_AUDIO_STRICT_BYOK") ?? "true").toLowerCase() !==
    "false";

/**
 * Monta o diálogo a partir das `utterances` do Deepgram, em ordem de tempo e
 * com o falante pelo CANAL -- canal 0 é quem atendeu (a perna da ligação que o
 * Twilio grava primeiro no modo dual), canal 1 é o outro lado.
 * Sem utterances (áudio de um canal só), cai para o texto corrido.
 */
function textoDoDeepgram(raw: unknown): string {
  const r = raw as {
    results?: {
      utterances?: { channel?: number; start?: number; transcript?: string }[];
      channels?: { alternatives?: { transcript?: string }[] }[];
    };
  };
  const utt = r?.results?.utterances;
  if (Array.isArray(utt) && utt.length > 0) {
    return utt
      .slice()
      .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
      .map((u) => {
        const quem = (u.channel ?? 0) === 0 ? "Atendente" : "Cliente";
        const t = (u.transcript ?? "").trim();
        return t ? `[${quem}] ${t}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return (r?.results?.channels ?? [])
    .map((c) => (c.alternatives?.[0]?.transcript ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

Deno.serve(async (req) => {
  if (req.headers.get("x-worker-token") !== WORKER_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: {
    recording_id?: string;
    organization_id?: string;
    job_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const { recording_id, organization_id, job_id } = body;
  if (!recording_id || !organization_id) {
    return json({ error: "missing_params" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: rec } = await admin.from("call_recordings")
    .select("id, call_id, storage_path, transcription, duration_seconds")
    .eq("id", recording_id).eq("organization_id", organization_id)
    .maybeSingle();
  if (!rec) return json({ error: "recording_not_found" }, 404);

  // Idempotente: o worker pode reentregar o job.
  if (rec.transcription) {
    return json({ ok: true, skipped: "already_transcribed" });
  }
  if (!rec.storage_path) {
    // O arquivamento ainda não rodou. 502 para o worker tentar mais tarde, em
    // vez de marcar como falha permanente.
    return json({ error: "not_archived_yet" }, 502);
  }

  let provider;
  try {
    provider = await resolveProvider(admin, organization_id, "transcription");
  } catch (e) {
    if (e instanceof ProviderResolutionError) {
      // Sem provider configurado não é erro retryable: viraria tempestade de
      // retry no worker. Trata como skip idempotente, igual ao transcribe-audio.
      if (e.code === "no_provider") {
        return json({ ok: true, skipped: "no_transcription_provider" });
      }
      return json({ error: e.code }, 402);
    }
    throw e;
  }
  if (STRICT_BYOK && provider.source !== "customer_key") {
    return json({ error: "byok_required", capability: "transcription" }, 402);
  }

  // O Deepgram busca o áudio por URL; os outros sobem o arquivo. Baixar 24 MB
  // dentro da função só para reenviar é o que faz ligação longa estourar.
  let audioBlob: Blob | null = null;
  let signedUrl: string | null = null;
  if (provider.provider === "deepgram") {
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(rec.storage_path, 3600);
    if (signErr || !signed?.signedUrl) {
      return json({ error: "storage_sign_failed" }, 502);
    }
    signedUrl = signed.signedUrl;
  } else {
    const dl = await admin.storage.from(BUCKET).download(rec.storage_path);
    if (dl.error || !dl.data) {
      return json({ error: "storage_download_failed" }, 502);
    }
    audioBlob = dl.data;
  }

  const form = new FormData();
  if (audioBlob) form.append("file", audioBlob, "call.mp3");
  form.append("model", provider.model);
  form.append("language", "pt");

  let text: string;
  let raw: unknown;
  if (provider.provider === "deepgram") {
    // `multichannel` + `utterances`: a gravação é `record-from-answer-dual`,
    // um canal por pessoa. Separar por canal é exato -- não é modelo
    // adivinhando quem falou, e já diz QUAL dos dois é o atendente (canal 0).
    const qs = new URLSearchParams({
      model: provider.model,
      language: "pt-BR",
      multichannel: "true",
      utterances: "true",
      punctuate: "true",
      smart_format: "true",
    });
    const r = await fetch(`https://api.deepgram.com/v1/listen?${qs}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: signedUrl }),
    });
    if (!r.ok) {
      const err = sanitizeProviderError(r.status, await r.text());
      safeLog("[telephony-transcribe-call] provider error", {
        provider: provider.provider,
        kind: err.kind,
        status: err.status,
      });
      return json(
        { error: "provider_error", kind: err.kind },
        err.status >= 500 ? 502 : 400,
      );
    }
    raw = await r.json();
    text = textoDoDeepgram(raw);
  } else if (provider.provider === "elevenlabs") {
    const f = new FormData();
    f.append("file", audioBlob!, "call.mp3");
    f.append("model_id", provider.model);
    f.append("language_code", "por");
    f.append("tag_audio_events", "false");
    // Ligação tem dois falantes: a separação por falante ajuda a ler depois.
    f.append("diarize", "true");
    const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": provider.apiKey },
      body: f,
    });
    if (!r.ok) {
      const err = sanitizeProviderError(r.status, await r.text());
      safeLog("[telephony-transcribe-call] provider error", {
        provider: provider.provider,
        kind: err.kind,
        status: err.status,
      });
      return json(
        { error: "provider_error", kind: err.kind },
        err.status >= 500 ? 502 : 400,
      );
    }
    raw = await r.json();
    text = (raw as { text?: string })?.text ?? "";
  } else {
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      body: form,
    });
    if (!r.ok) {
      const err = sanitizeProviderError(r.status, await r.text());
      safeLog("[telephony-transcribe-call] provider error", {
        provider: provider.provider,
        kind: err.kind,
        status: err.status,
      });
      return json(
        { error: "provider_error", kind: err.kind },
        err.status >= 500 ? 502 : 400,
      );
    }
    raw = await r.json();
    text = (raw as { text?: string })?.text ?? "";
  }

  text = (text ?? "").trim();
  // Mesmo filtro do transcribe-audio: o Whisper inventa frases de abertura em
  // áudio quase mudo ("Legendas pela comunidade...", etc).
  if (!text || isLikelyHallucination(text)) {
    await admin.from("call_recordings").update({
      transcription: "",
    }).eq("id", rec.id);
    return json({ ok: true, skipped: "empty_or_hallucination" });
  }

  await admin.from("call_recordings").update({ transcription: text })
    .eq("id", rec.id);

  const cost = await estimateAudioCostUsd(
    admin,
    provider.provider,
    provider.model,
    Number(rec.duration_seconds ?? 0) || 30,
  );
  await logAiUsage(admin, {
    organization_id,
    provider: provider.provider,
    model: provider.model,
    source: provider.source,
    action: "transcribe_call",
    integration_slug: provider.provider,
    estimated_cost_usd: cost,
    entity_type: "call_recording",
    entity_id: rec.id,
    job_id: job_id ?? null,
  });

  return json({ ok: true, chars: text.length, source: provider.source });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// telephony-archive-recording
//
// Traz o áudio da gravação do Twilio para o Supabase Storage e só então o apaga
// de lá. É isso que corta o custo recorrente: no Twilio o armazenamento é
// cobrado por mês e é CUMULATIVO -- medido em 19/10/2026, o volume da Central
// Trabalhista (3.084 min/mês) daria ~US$46/mês e crescendo, contra ~US$1 a 2
// aqui.
//
// A ORDEM É A SEGURANÇA: baixa -> sobe -> LÊ DE VOLTA e confere o tamanho ->
// só aí apaga do Twilio. Apagar antes de confirmar perderia o áudio para
// sempre. Se qualquer passo falhar, o áudio continua no Twilio e o job é
// reenfileirado pelo worker.
//
// Chamado pelo intelligence-worker com target_action
// "intelligence.archive_recording".

import { createClient } from "jsr:@supabase/supabase-js@2";
import { loadTwilioVoiceConfig } from "../_shared/telephony/twilio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("INTELLIGENCE_WORKER_TOKEN")!;
const BUCKET = "call-recordings";

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
  const { recording_id, organization_id } = body;
  if (!recording_id || !organization_id) {
    return json({ error: "missing_params" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: rec } = await admin.from("call_recordings")
    .select(
      "id, organization_id, call_id, recording_sid, recording_url, storage_path, duration_seconds",
    )
    .eq("id", recording_id).eq("organization_id", organization_id)
    .maybeSingle();
  if (!rec) return json({ error: "recording_not_found" }, 404);

  // Idempotente: se já foi arquivado, nada a fazer. O worker pode reentregar.
  if (rec.storage_path) {
    return json({ ok: true, skipped: "already_archived" });
  }
  if (!rec.recording_url || !rec.recording_sid) {
    return json({ ok: true, skipped: "no_provider_url" });
  }

  const config = await loadTwilioVoiceConfig(admin, organization_id);
  const auth = "Basic " + btoa(`${config.accountSid}:${config.authToken}`);

  // ---- 1. baixa do Twilio
  const media = await fetch(rec.recording_url, {
    headers: { Authorization: auth },
  });
  if (!media.ok) {
    // 5xx do Twilio é transitório: devolve 502 para o worker tentar de novo.
    return json(
      { error: "twilio_download_failed", status: media.status },
      media.status >= 500 ? 502 : 400,
    );
  }
  const bytes = new Uint8Array(await media.arrayBuffer());
  if (bytes.byteLength === 0) {
    return json({ error: "empty_audio" }, 502);
  }

  // ---- 2. sobe no bucket
  const path = `${organization_id}/${rec.call_id}/${rec.recording_sid}.mp3`;
  const up = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: "audio/mpeg",
    upsert: true,
  });
  if (up.error) {
    return json({ error: "upload_failed", detail: up.error.message }, 502);
  }

  // ---- 3. LÊ DE VOLTA e confere o tamanho antes de deixar apagar
  const back = await admin.storage.from(BUCKET).download(path);
  if (back.error || !back.data) {
    return json({ error: "readback_failed" }, 502);
  }
  const storedSize = back.data.size;
  if (storedSize !== bytes.byteLength) {
    return json(
      {
        error: "size_mismatch",
        expected: bytes.byteLength,
        stored: storedSize,
      },
      502,
    );
  }

  await admin.from("call_recordings").update({
    storage_path: path,
    file_size_bytes: storedSize,
  }).eq("id", rec.id);

  // ---- 4. só agora apaga do Twilio
  let twilioDeleted = false;
  try {
    const del = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Recordings/${rec.recording_sid}.json`,
      { method: "DELETE", headers: { Authorization: auth } },
    );
    // 404 = já não existe lá, o que para nós é o mesmo que apagado.
    twilioDeleted = del.ok || del.status === 404;
    if (!twilioDeleted) {
      console.error("[telephony-archive-recording] twilio_delete_failed", {
        recordingSid: rec.recording_sid,
        status: del.status,
      });
    }
  } catch (e) {
    // Falhar o delete NÃO desfaz o arquivamento: o áudio já está seguro aqui.
    // Fica pagando armazenamento no Twilio até alguém limpar, e é só isso.
    console.error("[telephony-archive-recording] twilio_delete_error", {
      recordingSid: rec.recording_sid,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // ---- 5. enfileira a transcrição, só para conversa de verdade.
  // Das 1.323 ligações completadas em 30 dias, apenas 137 passam de 1 minuto --
  // e elas concentram 92% dos minutos. O resto são ~12s de caixa postal e não
  // atendida, que não têm o que transcrever.
  const duration = Number(rec.duration_seconds ?? 0);
  if (duration > 60) {
    await admin.from("intelligence_jobs").insert({
      organization_id,
      target_action: "intelligence.transcribe_call",
      payload: { recording_id: rec.id },
      idempotency_key: `transcribe_call:${rec.recording_sid}`,
    });
  }

  return json({
    ok: true,
    storage_path: path,
    bytes: storedSize,
    twilio_deleted: twilioDeleted,
    transcription_queued: duration > 60,
  });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

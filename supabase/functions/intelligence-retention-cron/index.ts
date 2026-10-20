// Purga o que passou do prazo de retenção de cada organização:
//   - audio_transcriptions  por privacy.transcription_retention_days
//   - gravações de ligação  por privacy.call_recording_retention_days
//
// Em ambos, `0` significa NUNCA APAGAR (o laço faz `continue`), e a ausência da
// chave cai no default de 180 dias.
//
// A gravação é apagada em DUAS partes -- o objeto no bucket e a linha em
// call_recordings -- e nesta ordem: o objeto primeiro. Se o storage falhar, a
// linha fica e a próxima rodada tenta de novo; o contrário deixaria áudio órfão
// no bucket, sem nada no banco apontando para ele.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("INTELLIGENCE_WORKER_TOKEN")!;

Deno.serve(async (req) => {
  if (req.headers.get("x-worker-token") !== WORKER_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: orgs } = await admin
    .from("intelligence_settings")
    .select("organization_id, privacy");

  let deleted = 0;
  for (const o of orgs ?? []) {
    const days = Number(o.privacy?.transcription_retention_days ?? 180);
    if (days <= 0) continue;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data: rows, error } = await admin
      .from("audio_transcriptions")
      .delete()
      .eq("organization_id", o.organization_id)
      .lt("created_at", cutoff)
      .select("id");
    if (error) continue;
    deleted += rows?.length ?? 0;
  }

  // ---- gravações de ligação: objeto no bucket + linha
  let recordingsDeleted = 0;
  let storageFailures = 0;
  for (const o of orgs ?? []) {
    const days = Number(o.privacy?.call_recording_retention_days ?? 180);
    if (days <= 0) continue;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data: velhas } = await admin
      .from("call_recordings")
      .select("id, storage_path")
      .eq("organization_id", o.organization_id)
      .lt("created_at", cutoff)
      .limit(500);
    for (const r of velhas ?? []) {
      if (r.storage_path) {
        const { error } = await admin.storage.from("call-recordings").remove([
          r.storage_path,
        ]);
        // Não apaga a linha se o objeto não saiu: áudio órfão no bucket é pior
        // que uma linha a mais, porque ninguém mais sabe que ele existe.
        if (error) {
          storageFailures += 1;
          continue;
        }
      }
      const { error: delErr } = await admin.from("call_recordings").delete().eq(
        "id",
        r.id,
      );
      if (!delErr) recordingsDeleted += 1;
    }
  }

  return json({
    ok: true,
    deleted,
    recordings_deleted: recordingsDeleted,
    storage_failures: storageFailures,
  });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

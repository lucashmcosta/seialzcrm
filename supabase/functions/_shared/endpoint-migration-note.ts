// Helper compartilhado para inserir, de forma lazy e idempotente, a nota de sistema
// que sinaliza a migração de provider de um communication_endpoint.
//
// Política:
// - Inserir apenas no primeiro outbound da thread após a migração.
// - Uma única nota por (thread, endpoint).
// - Só age se o endpoint tiver metadata.migration.migration_version >= 1.
// - Só age se a thread já existia antes da migração (thread.created_at < performed_at).
// - Texto e estrutura reaproveitam o renderer de divisor de sistema já existente.

const NOTE_TEXT_DEFAULT =
  "A partir deste ponto, este número passou a operar via Meta Cloud API. Todo o histórico anterior via Twilio foi preservado.";

export const ENDPOINT_PROVIDER_MIGRATION_NOTE_KIND = "endpoint_provider_migration";

interface EnsureOpts {
  /** ISO opcional para forçar o sent_at/created_at da nota (deve ser anterior ao outbound). */
  noteTimestamp?: string;
  /** Texto custom; se ausente usa o padrão. */
  noteText?: string;
}

/**
 * Garante existência da nota de migração para a thread informada, caso aplicável.
 * Retorna `{ inserted, skipped_reason? }`. Nunca lança — apenas loga.
 */
export async function ensureEndpointMigrationNote(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  threadId: string,
  endpointId: string,
  opts: EnsureOpts = {},
): Promise<{ inserted: boolean; skipped_reason?: string }> {
  try {
    if (!threadId || !endpointId) {
      return { inserted: false, skipped_reason: "missing_ids" };
    }

    // 1) Carrega endpoint e confirma que houve migração registrada.
    const { data: endpoint, error: epErr } = await supabase
      .from("communication_endpoints")
      .select("id, organization_id, metadata")
      .eq("id", endpointId)
      .maybeSingle();
    if (epErr || !endpoint) {
      return { inserted: false, skipped_reason: "endpoint_not_found" };
    }
    const migration = (endpoint.metadata as any)?.migration;
    const migrationVersion = Number(migration?.migration_version ?? 0);
    if (!migration || migrationVersion < 1) {
      return { inserted: false, skipped_reason: "no_migration_metadata" };
    }
    const performedAt = migration.performed_at as string | undefined;
    if (!performedAt) {
      return { inserted: false, skipped_reason: "missing_performed_at" };
    }

    // 2) Confirma que a thread já existia antes da migração.
    const { data: thread, error: tErr } = await supabase
      .from("message_threads")
      .select("id, created_at, organization_id")
      .eq("id", threadId)
      .maybeSingle();
    if (tErr || !thread) {
      return { inserted: false, skipped_reason: "thread_not_found" };
    }
    if (thread.organization_id !== endpoint.organization_id) {
      return { inserted: false, skipped_reason: "org_mismatch" };
    }
    if (!thread.created_at) {
      return { inserted: false, skipped_reason: "thread_missing_created_at" };
    }
    if (new Date(thread.created_at).getTime() >= new Date(performedAt).getTime()) {
      return { inserted: false, skipped_reason: "thread_created_after_migration" };
    }

    // 3) Lookup idempotente: já existe nota para (thread, endpoint)?
    const { data: existing, error: selErr } = await supabase
      .from("messages")
      .select("id")
      .eq("thread_id", threadId)
      .contains("metadata", {
        kind: ENDPOINT_PROVIDER_MIGRATION_NOTE_KIND,
        migration_endpoint_id: endpointId,
      })
      .limit(1)
      .maybeSingle();
    if (selErr) {
      console.warn("[endpoint-migration-note] lookup failed", {
        threadId,
        endpointId,
        error: selErr.message,
      });
      return { inserted: false, skipped_reason: "lookup_failed" };
    }
    if (existing) {
      return { inserted: false, skipped_reason: "already_exists" };
    }

    // 4) Insere a nota. Reusa o mesmo padrão do divisor existente
    // (direction='internal', sender_type='system'). Renderer detecta por metadata.kind.
    const ts = opts.noteTimestamp ?? new Date().toISOString();
    const { error: insErr } = await supabase
      .from("messages")
      .insert({
        organization_id: endpoint.organization_id,
        thread_id: threadId,
        content: opts.noteText ?? NOTE_TEXT_DEFAULT,
        direction: "internal",
        sender_type: "system",
        sender_name: "Sistema",
        sent_at: ts,
        created_at: ts,
        endpoint_id: endpointId,
        metadata: {
          kind: ENDPOINT_PROVIDER_MIGRATION_NOTE_KIND,
          system_note_kind: ENDPOINT_PROVIDER_MIGRATION_NOTE_KIND,
          migration_endpoint_id: endpointId,
          migration_version: migrationVersion,
          from_provider: migration.previous_provider ?? null,
          to_provider: migration.after?.provider ?? null,
          performed_at: performedAt,
        },
      });
    if (insErr) {
      console.warn("[endpoint-migration-note] insert failed", {
        threadId,
        endpointId,
        error: insErr.message,
      });
      return { inserted: false, skipped_reason: "insert_failed" };
    }
    return { inserted: true };
  } catch (e) {
    console.error("[endpoint-migration-note] fatal", (e as Error).message);
    return { inserted: false, skipped_reason: "exception" };
  }
}

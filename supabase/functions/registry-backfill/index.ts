import { featureFlagEnabled } from "../_shared/feature-flags.ts";
import { requireRegistryAccess } from "../_shared/registry/auth.ts";
import { lookupCpfBrasil } from "../_shared/registry/providers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

async function identifierHash(value: string): Promise<string> {
  const secret = Deno.env.get("REGISTRY_AUDIT_HASH_KEY")
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? "registry-audit";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const organizationId = String(body.organization_id ?? "");
  const requestedJobId = body.job_id ? String(body.job_id) : null;
  const requestedLimit = Number(body.limit ?? 20);
  const batchLimit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 20, 100));
  if (!organizationId) return json({ error: "organization_id_required" }, 400);

  const auth = await requireRegistryAccess(req, organizationId);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (auth.permissions.can_manage_settings !== true) {
    return json({ error: "backfill_requires_manage_settings" }, 403);
  }

  const enabled = await featureFlagEnabled(auth.admin, "registry_lookup_br", organizationId);
  if (!enabled) return json({ error: "registry_lookup_disabled" }, 503);
  const { data: providerSettings } = await auth.admin
    .from("registry_provider_settings")
    .select("cpf_lookup_enabled, documented_purpose, privacy_notice_updated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (
    providerSettings?.cpf_lookup_enabled !== true
    || !providerSettings.documented_purpose
    || !providerSettings.privacy_notice_updated_at
  ) {
    return json({ error: "cpf_lookup_not_authorized_for_organization" }, 403);
  }

  let jobQuery = auth.admin
    .from("registry_backfill_jobs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("kind", "cpf");
  jobQuery = requestedJobId
    ? jobQuery.eq("id", requestedJobId)
    : jobQuery.in("status", ["pending", "running", "paused"]).order("created_at", { ascending: true });
  const { data: job, error: jobError } = await jobQuery.limit(1).maybeSingle();
  if (jobError) return json({ error: "backfill_job_lookup_failed" }, 500);
  if (!job) return json({ ok: true, status: "nothing_to_process" });
  if (job.status === "completed") return json({ ok: true, job });

  await auth.admin
    .from("registry_backfill_jobs")
    .update({
      status: "running",
      started_at: job.started_at ?? new Date().toISOString(),
      last_error_code: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  let contactsQuery = auth.admin
    .from("contacts")
    .select("id, full_name, cpf")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .not("cpf", "is", null)
    .order("id", { ascending: true })
    .limit(batchLimit);
  if (job.last_contact_id) contactsQuery = contactsQuery.gt("id", job.last_contact_id);
  const { data: contacts, error: contactsError } = await contactsQuery;
  if (contactsError) {
    await auth.admin.from("registry_backfill_jobs").update({
      status: "error",
      last_error_code: "contacts_query_failed",
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    return json({ error: "contacts_query_failed" }, 500);
  }

  if (!contacts?.length) {
    const { data: completed } = await auth.admin
      .from("registry_backfill_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .select("*")
      .single();
    return json({ ok: true, status: "completed", job: completed });
  }

  let processed = 0;
  let verified = 0;
  let conflicts = 0;
  let errors = 0;
  let lastContactId = job.last_contact_id as string | null;
  let pauseError: string | null = null;

  for (const contact of contacts) {
    const cpf = String(contact.cpf ?? "").replace(/\D/g, "");
    lastContactId = contact.id;
    const started = Date.now();
    const result = await lookupCpfBrasil(cpf);
    const hash = await identifierHash(`cpf:${cpf}`);

    await auth.admin.from("registry_lookup_audit").insert({
      organization_id: organizationId,
      requested_by_user_id: auth.userId,
      lookup_kind: "cpf",
      provider: result.provider,
      identifier_hash: hash,
      identifier_suffix: cpf.slice(-4),
      outcome: result.ok ? "success" : "error",
      http_status: result.status || null,
      duration_ms: Date.now() - started,
      error_code: result.ok ? null : result.error,
    });

    processed += 1;
    if (result.ok) {
      const providerName = String(result.payload.full_name ?? "").trim();
      const nameConflict = providerName
        && normalizeName(providerName) !== normalizeName(contact.full_name);
      if (nameConflict) {
        conflicts += 1;
        const { data: existingConflict } = await auth.admin
          .from("registry_data_conflicts")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("contact_id", contact.id)
          .eq("conflict_type", "cpf_name_mismatch")
          .eq("status", "pending")
          .limit(1)
          .maybeSingle();
        if (!existingConflict) {
          await auth.admin.from("registry_data_conflicts").insert({
            organization_id: organizationId,
            contact_id: contact.id,
            conflict_type: "cpf_name_mismatch",
            current_value: contact.full_name,
            provider_value: providerName,
          });
        }
      }

      await auth.admin.from("contact_identity_profiles").upsert({
        organization_id: organizationId,
        contact_id: contact.id,
        cpf_verification_status: "verified",
        cpf_registration_status: result.payload.registration_status,
        birth_date: result.payload.birth_date,
        sex: result.payload.sex,
        mother_name: result.payload.mother_name,
        verification_provider: result.provider,
        verification_provider_version: result.version,
        cpf_verified_at: new Date().toISOString(),
        last_error_code: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "contact_id" });
      verified += 1;
    } else {
      errors += 1;
      const status = result.error === "invalid_or_not_found" ? "invalid" : "error";
      await auth.admin.from("contact_identity_profiles").upsert({
        organization_id: organizationId,
        contact_id: contact.id,
        cpf_verification_status: status,
        verification_provider: result.provider,
        verification_provider_version: result.version,
        cpf_verified_at: null,
        last_error_code: result.error,
        updated_at: new Date().toISOString(),
      }, { onConflict: "contact_id" });

      if (result.error === "provider_not_configured" || result.status === 401 || result.status === 403 || result.status === 429) {
        pauseError = result.error === "upstream_error" ? `provider_http_${result.status}` : result.error;
        break;
      }
    }
  }

  const nextStatus = pauseError ? "paused" : "pending";
  const { data: updatedJob } = await auth.admin
    .from("registry_backfill_jobs")
    .update({
      status: nextStatus,
      processed_items: Number(job.processed_items ?? 0) + processed,
      verified_items: Number(job.verified_items ?? 0) + verified,
      conflict_items: Number(job.conflict_items ?? 0) + conflicts,
      error_items: Number(job.error_items ?? 0) + errors,
      last_contact_id: lastContactId,
      last_error_code: pauseError,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .select("*")
    .single();

  return json({
    ok: true,
    status: nextStatus,
    processed_in_batch: processed,
    job: updatedJob,
  });
});

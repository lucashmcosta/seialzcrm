import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { featureFlagEnabled } from "../_shared/feature-flags.ts";
import { requireRegistryAccess } from "../_shared/registry/auth.ts";
import { decidePersonNameMatch } from "../_shared/registry/name-match.ts";
import {
  isValidCpfValue,
  lookupCpfBrasil,
  type ProviderResult,
} from "../_shared/registry/providers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-registry-operator-token",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESTART_CONFIRMATION = "CENTRAL_TRABALHISTA_CPF_BACKFILL";
const RECONCILIATION_CONFIRMATION =
  "APPLY_REVIEWED_CPF_RECONCILIATION";
const REVIEWED_RECONCILIATION_ORGANIZATIONS = new Set([
  "40ae935c-a7f7-4ad7-8ea4-91be6404a95f",
  "b246ef6f-6242-4011-a112-6d8783d2896a",
]);

type BackfillAuth =
  | {
    ok: true;
    admin: SupabaseClient;
    userId: string | null;
    permissions: Record<string, boolean>;
    operator: boolean;
  }
  | { ok: false; status: number; error: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function authorizeBackfill(
  req: Request,
  organizationId: string,
): Promise<BackfillAuth> {
  const expectedToken = Deno.env.get("REGISTRY_BACKFILL_OPERATOR_TOKEN")
    ?.trim();
  const pilotOrganizationId = Deno.env.get("REGISTRY_BACKFILL_PILOT_ORG_ID")
    ?.trim();
  const suppliedToken = req.headers.get("x-registry-operator-token")?.trim() ??
    "";
  if (
    expectedToken &&
    pilotOrganizationId === organizationId &&
    timingSafeEqual(expectedToken, suppliedToken)
  ) {
    return {
      ok: true,
      admin: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
      userId: null,
      permissions: { can_manage_settings: true, can_edit_contacts: true },
      operator: true,
    };
  }

  const userAuth = await requireRegistryAccess(req, organizationId);
  return userAuth.ok ? { ...userAuth, operator: false } : userAuth;
}

async function recordNameConflict(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  currentName: string,
  providerName: string,
): Promise<void> {
  const { data: existingConflict } = await admin
    .from("registry_data_conflicts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("conflict_type", "cpf_name_mismatch")
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (existingConflict) {
    await admin.from("registry_data_conflicts").update({
      current_value: currentName,
      provider_value: providerName,
    }).eq("id", existingConflict.id);
    return;
  }
  await admin.from("registry_data_conflicts").insert({
    organization_id: organizationId,
    contact_id: contactId,
    conflict_type: "cpf_name_mismatch",
    current_value: currentName,
    provider_value: providerName,
  });
}

async function resolveNameConflict(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
): Promise<void> {
  await admin
    .from("registry_data_conflicts")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("conflict_type", "cpf_name_mismatch")
    .eq("status", "pending");
}

async function identifierHash(value: string): Promise<string> {
  const secret = Deno.env.get("REGISTRY_AUDIT_HASH_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    "registry-audit";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function applyReviewedReconciliation(
  auth: Extract<BackfillAuth, { ok: true }>,
  organizationId: string,
): Promise<Response> {
  const { data: organization, error: organizationError } = await auth.admin
    .from("organizations")
    .select("operating_country_code")
    .eq("id", organizationId)
    .maybeSingle();
  if (organizationError || organization?.operating_country_code !== "BR") {
    return json({ error: "reconciliation_requires_br_organization" }, 409);
  }

  const { data: nameConflicts, error: conflictError } = await auth.admin
    .from("registry_data_conflicts")
    .select("id, contact_id, provider_value")
    .eq("organization_id", organizationId)
    .eq("conflict_type", "cpf_name_mismatch")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (conflictError) {
    return json({ error: "name_conflicts_lookup_failed" }, 500);
  }

  let namesApplied = 0;
  let nameConflictsResolved = 0;
  let nameErrors = 0;
  const nameErrorDetails: Array<Record<string, string>> = [];
  for (const conflict of nameConflicts ?? []) {
    const providerName = String(conflict.provider_value ?? "").trim();
    if (!conflict.contact_id || !providerName) {
      nameErrors += 1;
      nameErrorDetails.push({
        conflict_id: String(conflict.id),
        stage: "validate_provider_name",
        code: "provider_name_missing",
      });
      continue;
    }

    const { data: updatedContact, error: updateError } = await auth.admin
      .from("contacts")
      .update({
        full_name: providerName,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("id", conflict.contact_id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (updateError || !updatedContact) {
      nameErrors += 1;
      nameErrorDetails.push({
        conflict_id: String(conflict.id),
        contact_id: String(conflict.contact_id),
        stage: "update_contact_name",
        code: String(updateError?.code ?? "contact_not_updated"),
        message: String(updateError?.message ?? "contact_not_updated"),
      });
      continue;
    }
    namesApplied += 1;

    const { error: resolveError } = await auth.admin
      .from("registry_data_conflicts")
      .update({
        status: "accepted",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", conflict.id)
      .eq("organization_id", organizationId)
      .eq("status", "pending");
    if (resolveError) {
      nameErrors += 1;
      nameErrorDetails.push({
        conflict_id: String(conflict.id),
        contact_id: String(conflict.contact_id),
        stage: "resolve_name_conflict",
        code: String(resolveError.code ?? "conflict_not_resolved"),
        message: String(resolveError.message ?? "conflict_not_resolved"),
      });
      continue;
    }
    nameConflictsResolved += 1;
  }

  const { data: invalidProfiles, error: profileError } = await auth.admin
    .from("contact_identity_profiles")
    .select(
      "contact_id, verification_provider, verification_provider_version, last_error_code",
    )
    .eq("organization_id", organizationId)
    .eq("cpf_verification_status", "invalid")
    .limit(2_000);
  if (profileError) {
    return json({ error: "invalid_profiles_lookup_failed" }, 500);
  }

  const invalidProfileByContact = new Map(
    (invalidProfiles ?? []).map((profile) => [
      String(profile.contact_id),
      profile,
    ]),
  );
  const invalidContactIds = [...invalidProfileByContact.keys()];
  const contactsWithInvalidCpf: Array<{ id: string; cpf: string }> = [];
  for (let index = 0; index < invalidContactIds.length; index += 100) {
    const contactIds = invalidContactIds.slice(index, index + 100);
    const { data: contacts, error: contactsError } = await auth.admin
      .from("contacts")
      .select("id, cpf")
      .eq("organization_id", organizationId)
      .in("id", contactIds)
      .is("deleted_at", null)
      .not("cpf", "is", null);
    if (contactsError) {
      return json({ error: "invalid_contacts_lookup_failed" }, 500);
    }
    for (const contact of contacts ?? []) {
      const cpf = String(contact.cpf ?? "");
      if (cpf.trim()) {
        contactsWithInvalidCpf.push({ id: String(contact.id), cpf });
      }
    }
  }

  let invalidCpfsPreserved = 0;
  let invalidCpfsCleared = 0;
  let invalidCpfErrors = 0;
  const invalidCpfErrorDetails: Array<Record<string, string>> = [];
  for (const contact of contactsWithInvalidCpf) {
    const profile = invalidProfileByContact.get(contact.id);
    const { data: existingHistory, error: historyLookupError } =
      await auth.admin
        .from("registry_data_conflicts")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("contact_id", contact.id)
        .eq("conflict_type", "cpf_invalid_removed")
        .limit(1)
        .maybeSingle();
    if (historyLookupError) {
      invalidCpfErrors += 1;
      invalidCpfErrorDetails.push({
        contact_id: contact.id,
        stage: "lookup_preserved_history",
        code: String(historyLookupError.code ?? "history_lookup_failed"),
        message: String(historyLookupError.message ?? "history_lookup_failed"),
      });
      continue;
    }

    if (!existingHistory) {
      const { error: preserveError } = await auth.admin
        .from("registry_data_conflicts")
        .insert({
          organization_id: organizationId,
          contact_id: contact.id,
          conflict_type: "cpf_invalid_removed",
          current_value: contact.cpf,
          provider_value: JSON.stringify({
            verification_provider: profile?.verification_provider ?? null,
            verification_provider_version:
              profile?.verification_provider_version ?? null,
            last_error_code: profile?.last_error_code ?? null,
          }),
          status: "accepted",
          resolved_at: new Date().toISOString(),
        });
      if (preserveError) {
        invalidCpfErrors += 1;
        invalidCpfErrorDetails.push({
          contact_id: contact.id,
          stage: "preserve_invalid_cpf",
          code: String(preserveError.code ?? "history_insert_failed"),
          message: String(preserveError.message ?? "history_insert_failed"),
        });
        continue;
      }
    }
    invalidCpfsPreserved += 1;

    const { data: clearedContact, error: clearError } = await auth.admin
      .from("contacts")
      .update({
        cpf: null,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("id", contact.id)
      .eq("cpf", contact.cpf)
      .select("id")
      .maybeSingle();
    if (clearError || !clearedContact) {
      invalidCpfErrors += 1;
      invalidCpfErrorDetails.push({
        contact_id: contact.id,
        stage: "clear_contact_cpf",
        code: String(clearError?.code ?? "contact_not_updated"),
        message: String(clearError?.message ?? "contact_not_updated"),
      });
      continue;
    }
    invalidCpfsCleared += 1;
  }

  const summary = {
    provider_names_applied: namesApplied,
    name_conflicts_resolved: nameConflictsResolved,
    name_errors: nameErrors,
    invalid_cpfs_found: contactsWithInvalidCpf.length,
    invalid_cpfs_preserved: invalidCpfsPreserved,
    invalid_cpfs_cleared: invalidCpfsCleared,
    invalid_cpf_errors: invalidCpfErrors,
    name_error_details: nameErrorDetails.slice(0, 20),
    invalid_cpf_error_details: invalidCpfErrorDetails.slice(0, 20),
  };
  await auth.admin.from("audit_logs").insert({
    organization_id: organizationId,
    entity_type: "organizations",
    entity_id: organizationId,
    action: "CPF_RECONCILIATION_REVIEW_APPLIED",
    old_data: null,
    new_data: summary,
    changed_by_user_id: auth.userId,
  });

  const hasErrors = nameErrors > 0 || invalidCpfErrors > 0;
  return json({
    ok: !hasErrors,
    mode: "apply_reviewed_reconciliation",
    organization_id: organizationId,
    ...summary,
  }, hasErrors ? 500 : 200);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const organizationId = String(body.organization_id ?? "");
  const requestedJobId = body.job_id ? String(body.job_id) : null;
  const mode = body.mode === "inventory"
    ? "inventory"
    : body.mode === "apply_reviewed_reconciliation"
    ? "apply_reviewed_reconciliation"
    : "process";
  const restart = body.restart === true;
  const requestedLimit = Number(body.limit ?? 20);
  const batchLimit = Math.max(
    1,
    Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 20, 100),
  );
  if (!organizationId) return json({ error: "organization_id_required" }, 400);

  const auth = await authorizeBackfill(req, organizationId);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (auth.permissions.can_manage_settings !== true) {
    return json({ error: "backfill_requires_manage_settings" }, 403);
  }
  if (mode === "apply_reviewed_reconciliation") {
    if (
      !auth.operator ||
      !REVIEWED_RECONCILIATION_ORGANIZATIONS.has(organizationId)
    ) {
      return json({ error: "reconciliation_requires_operator" }, 403);
    }
    if (body.confirm !== RECONCILIATION_CONFIRMATION) {
      return json({ error: "reconciliation_confirmation_required" }, 400);
    }
    return applyReviewedReconciliation(auth, organizationId);
  }

  const enabled = await featureFlagEnabled(
    auth.admin,
    "registry_lookup_br",
    organizationId,
  );
  if (!enabled) return json({ error: "registry_lookup_disabled" }, 503);
  const { data: providerSettings } = await auth.admin
    .from("registry_provider_settings")
    .select("cpf_lookup_enabled, documented_purpose, privacy_notice_updated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (
    providerSettings?.cpf_lookup_enabled !== true ||
    !providerSettings.documented_purpose ||
    !providerSettings.privacy_notice_updated_at
  ) {
    return json({ error: "cpf_lookup_not_authorized_for_organization" }, 403);
  }

  const baseContactsQuery = auth.admin
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .not("cpf", "is", null);
  const { count: totalCpfContacts, error: countError } =
    await baseContactsQuery;
  if (countError) return json({ error: "contacts_count_failed" }, 500);

  if (mode === "inventory") {
    const { data: currentJob } = await auth.admin
      .from("registry_backfill_jobs")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("kind", "cpf")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return json({
      ok: true,
      mode,
      organization_id: organizationId,
      cpf_contacts: totalCpfContacts ?? 0,
      estimated_provider_calls: totalCpfContacts ?? 0,
      current_job: currentJob,
    });
  }

  if (restart) {
    if (!auth.operator) {
      return json({ error: "restart_requires_operator" }, 403);
    }
    if (body.confirm_restart !== RESTART_CONFIRMATION) {
      return json({ error: "restart_confirmation_required" }, 400);
    }
    const { data: activeJob } = await auth.admin
      .from("registry_backfill_jobs")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("kind", "cpf")
      .in("status", ["pending", "running", "paused"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let restartJobId = activeJob?.id as string | undefined;
    if (!restartJobId) {
      const { data: latestJob } = await auth.admin
        .from("registry_backfill_jobs")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("kind", "cpf")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      restartJobId = latestJob?.id as string | undefined;
    }
    const resetValues = {
      status: "pending",
      total_items: totalCpfContacts ?? 0,
      processed_items: 0,
      verified_items: 0,
      conflict_items: 0,
      error_items: 0,
      last_contact_id: null,
      last_error_code: null,
      started_at: null,
      completed_at: null,
      updated_at: new Date().toISOString(),
    };
    if (restartJobId) {
      const { error: resetError } = await auth.admin
        .from("registry_backfill_jobs")
        .update(resetValues)
        .eq("id", restartJobId);
      if (resetError) return json({ error: "backfill_job_reset_failed" }, 500);
    } else {
      const { data: createdJob, error: createError } = await auth.admin
        .from("registry_backfill_jobs")
        .insert({
          organization_id: organizationId,
          kind: "cpf",
          ...resetValues,
        })
        .select("id")
        .single();
      if (createError) {
        return json({ error: "backfill_job_create_failed" }, 500);
      }
      restartJobId = createdJob.id;
    }
  }

  let jobQuery = auth.admin
    .from("registry_backfill_jobs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("kind", "cpf");
  jobQuery = requestedJobId
    ? jobQuery.eq("id", requestedJobId)
    : jobQuery.in("status", ["pending", "running", "paused"]).order(
      "created_at",
      { ascending: true },
    );
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
  if (job.last_contact_id) {
    contactsQuery = contactsQuery.gt("id", job.last_contact_id);
  }
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
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .select("*")
      .single();
    return json({ ok: true, status: "completed", job: completed });
  }

  let processed = 0;
  let verified = 0;
  let conflicts = 0;
  let errors = 0;
  let exactNames = 0;
  let autoMergedNames = 0;
  let filledEmptyNames = 0;
  let lastContactId = job.last_contact_id as string | null;
  let pauseError: string | null = null;

  for (const contact of contacts) {
    const cpf = String(contact.cpf ?? "").replace(/\D/g, "");
    const previousContactId = lastContactId;
    const started = Date.now();
    const result: ProviderResult = isValidCpfValue(cpf)
      ? await lookupCpfBrasil(cpf)
      : {
        ok: false,
        provider: "local-validator",
        version: "v1",
        status: 422,
        error: "invalid_or_not_found",
        retryable: false,
      };
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
      const nameMatch = decidePersonNameMatch(contact.full_name, providerName);
      if (nameMatch.decision === "exact") {
        exactNames += 1;
        await resolveNameConflict(auth.admin, organizationId, contact.id);
      } else if (
        nameMatch.decision === "auto_merge" ||
        nameMatch.decision === "fill_empty"
      ) {
        const updatePayload: Record<string, unknown> = {
          full_name: providerName,
          updated_at: new Date().toISOString(),
        };
        if (auth.userId) updatePayload.updated_by = auth.userId;
        const { error: nameUpdateError } = await auth.admin
          .from("contacts")
          .update(updatePayload)
          .eq("id", contact.id)
          .eq("organization_id", organizationId);
        if (nameUpdateError) {
          errors += 1;
          conflicts += 1;
          await recordNameConflict(
            auth.admin,
            organizationId,
            contact.id,
            String(contact.full_name ?? ""),
            providerName,
          );
        } else {
          if (nameMatch.decision === "fill_empty") filledEmptyNames += 1;
          else autoMergedNames += 1;
          await resolveNameConflict(auth.admin, organizationId, contact.id);
        }
      } else if (nameMatch.decision === "review") {
        conflicts += 1;
        await recordNameConflict(
          auth.admin,
          organizationId,
          contact.id,
          String(contact.full_name ?? ""),
          providerName,
        );
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
      const status = result.error === "invalid_or_not_found"
        ? "invalid"
        : "error";
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

      if (
        result.error === "provider_not_configured" || result.status === 401 ||
        result.status === 403 || result.status === 429
      ) {
        pauseError = result.error === "upstream_error"
          ? `provider_http_${result.status}`
          : result.error;
        // Não avança o cursor nem os contadores: após corrigir token/cota,
        // este mesmo contato precisa ser tentado novamente.
        lastContactId = previousContactId;
        processed -= 1;
        errors -= 1;
        break;
      }
    }
    lastContactId = contact.id;
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
    exact_names_in_batch: exactNames,
    auto_merged_names_in_batch: autoMergedNames,
    filled_empty_names_in_batch: filledEmptyNames,
    conflicts_in_batch: conflicts,
    errors_in_batch: errors,
    job: updatedJob,
  });
});

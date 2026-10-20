import { createClient } from "jsr:@supabase/supabase-js@2";
import { loadActiveIntegrationSecret } from "../_shared/integration-credentials.ts";
import {
  calcularEntrada,
  camposAlterados,
  ErroCalculo,
} from "../_shared/classificacao/certificar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type, x-nammux-signature, x-nammux-key-id, x-nammux-timestamp, x-nammux-event-id, x-nammux-event-type, x-nammux-organization-id, x-nammux-target-organization-id, x-trace-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const toleranceSeconds = 5 * 60;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const organizationId = req.headers.get("x-nammux-target-organization-id") ?? "";
  const sourceOrganizationId = req.headers.get("x-nammux-organization-id") ?? "";
  const keyId = req.headers.get("x-nammux-key-id") ?? "";
  const timestamp = req.headers.get("x-nammux-timestamp") ?? "";
  const signatureHeader = req.headers.get("x-nammux-signature") ?? "";
  const eventIdHeader = req.headers.get("x-nammux-event-id") ?? "";
  if (!organizationId || !sourceOrganizationId || !keyId || !timestamp || !signatureHeader) {
    return json(401, { error: "unauthorized" });
  }

  const timestampNumber = Number(timestamp);
  if (
    !Number.isFinite(timestampNumber) ||
    Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > toleranceSeconds
  ) {
    return json(401, { error: "unauthorized" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  let credential;
  try {
    credential = await loadActiveIntegrationSecret(admin, organizationId, keyId);
  } catch (error) {
    console.error("nammux credential lookup failed", error);
    return json(500, { error: "server_misconfigured" });
  }
  if (!credential) return json(401, { error: "unauthorized" });

  const rawBody = await req.text();
  const expected = await hmacSha256Hex(credential.secret, `${timestamp}.${rawBody}`);
  const provided = signatureHeader.replace(/^sha256=/i, "").toLowerCase();
  if (!safeEqual(expected, provided)) return json(401, { error: "unauthorized" });

  let envelope: Record<string, any>;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const eventId = eventIdHeader || String(envelope.event_id ?? "");
  const eventType = req.headers.get("x-nammux-event-type") || String(envelope.event_type ?? "");
  if (
    !eventId ||
    ![
      "process.snapshot.updated",
      "process.sync.failed",
      "contact.address.updated",
      "classification.certified",
    ].includes(eventType)
  ) {
    return json(400, { error: "unsupported_event" });
  }
  if (Number(envelope.schema_version ?? 0) !== 1) {
    return json(400, { error: "unsupported_schema_version" });
  }
  if (
    envelope.target_organization_id !== organizationId ||
    envelope.source_organization_id !== sourceOrganizationId
  ) {
    return json(401, { error: "organization_header_payload_mismatch" });
  }

  const { data: integration } = await admin
    .from("organization_integrations")
    .select("config_values, integration:admin_integrations!inner(slug)")
    .eq("organization_id", organizationId)
    .eq("admin_integrations.slug", "nammux")
    .eq("is_enabled", true)
    .maybeSingle();
  const config = (integration?.config_values ?? {}) as Record<string, unknown>;
  if (String(config.nammux_organization_id ?? "") !== sourceOrganizationId) {
    return json(403, { error: "organization_mapping_not_found" });
  }

  const { data: duplicate } = await admin
    .from("nammux_sync_events")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("direction", "inbound")
    .eq("external_event_id", eventId)
    .maybeSingle();
  if (duplicate) return json(200, { ok: true, duplicate: true });

  const data = (envelope.data ?? {}) as Record<string, any>;

  if (eventType === "contact.address.updated") {
    const contactId = String(data.seialz_contact_id ?? "");
    const address = (data.address ?? {}) as Record<string, unknown>;
    if (!contactId) return json(400, { error: "contact_id_required" });
    if (!address || typeof address !== "object") {
      return json(400, { error: "address_required" });
    }

    const sourceUpdatedAt = address.updated_at
      ? String(address.updated_at)
      : envelope.occurred_at
        ? String(envelope.occurred_at)
        : null;
    const { data: applied, error: applyError } = await admin.rpc(
      "apply_nammux_contact_address",
      {
        _organization_id: organizationId,
        _contact_id: contactId,
        _address: address,
        _source_event_id: eventId,
        _source_updated_at: sourceUpdatedAt,
      },
    );
    if (applyError) {
      const notLinked = /NAMMUX_CONTACT_NOT_LINKED|NAMMUX_CONTACT_NOT_FOUND/i.test(
        applyError.message,
      );
      console.error("contact address apply failed", applyError.message);
      return json(notLinked ? 404 : 500, {
        error: notLinked ? "contact_not_linked" : "contact_address_apply_failed",
      });
    }

    const result = (applied ?? {}) as Record<string, unknown>;
    const ignoredAsStale = result.ignored_as_stale === true;
    await admin.from("nammux_sync_events").insert({
      organization_id: organizationId,
      opportunity_id: result.opportunity_id ?? null,
      external_event_id: eventId,
      event_type: eventType,
      direction: "inbound",
      status: ignoredAsStale ? "conflict" : "processed",
      summary: {
        contact_id: contactId,
        ignored_as_stale: ignoredAsStale,
        address_fields_received: Object.entries(address)
          .filter(([key, value]) => key !== "updated_at" && value != null && String(value).trim())
          .map(([key]) => key),
      },
      occurred_at: envelope.occurred_at ?? null,
    });

    return json(200, {
      ok: true,
      contact_id: contactId,
      ignored_as_stale: ignoredAsStale,
    });
  }

  const opportunityId = String(data.seialz_opportunity_id ?? "");
  if (!opportunityId) return json(400, { error: "opportunity_id_required" });

  const { data: opportunity } = await admin
    .from("opportunities")
    .select("id, organization_id, contact_id, status")
    .eq("id", opportunityId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!opportunity) return json(404, { error: "opportunity_not_found" });

  // ===== Certificação pós-entrevista (Fase 3b) =====
  // A entrevista acontece no Nammux; quem calcula é aqui. O Nammux manda as
  // respostas conferidas, nunca faixa nem comissão -- o número é recalculado com
  // a MESMA versão de calibração que o vendedor usou, senão a entrevista baixaria
  // comissão por mudança de calibração em vez de por mudança de fato.
  if (eventType === "classification.certified") {
    const interviewer = String(data.interviewer ?? "").trim().slice(0, 200);
    if (!interviewer) return json(400, { error: "interviewer_required" });
    if (opportunity.status !== "won") return json(409, { error: "opportunity_not_won" });

    const { data: ativa } = await admin
      .from("process_classifications")
      .select("id, band, commission, input, calibration_version_id")
      .eq("opportunity_id", opportunityId)
      .eq("status", "active")
      .maybeSingle();
    if (!ativa) return json(409, { error: "not_classified" });

    const { data: cal } = await admin
      .from("classification_calibration_versions")
      .select("id, content, motor_version")
      .eq("id", ativa.calibration_version_id)
      .maybeSingle();
    if (!cal) return json(409, { error: "calibration_not_found" });

    let entrada: Record<string, unknown>;
    let resultado: Record<string, unknown>;
    try {
      const calculado = calcularEntrada(data.entrada, cal);
      entrada = calculado.entrada;
      resultado = calculado.resultado;
    } catch (e) {
      if (!(e instanceof ErroCalculo)) throw e;
      // Erro de entrada é permanente: reenviar o mesmo evento não conserta.
      await admin.from("nammux_sync_events").insert({
        organization_id: organizationId,
        opportunity_id: opportunityId,
        external_event_id: eventId,
        event_type: eventType,
        direction: "inbound",
        status: "error",
        error: e.codigo,
        summary: { campo: e.campo ?? null, pendencias: e.pendencias ?? null, interviewer },
        occurred_at: envelope.occurred_at ?? null,
      });
      return json(422, { error: e.codigo, campo: e.campo, pendencias: e.pendencias });
    }

    const mudou = camposAlterados(ativa.input as Record<string, unknown>, entrada);
    // `_external_event_id` tem índice único por organização: reenviar o mesmo
    // evento devolve a certificação que já existe, sem gravar de novo.
    const { data: gravado, error: certError } = await admin.rpc("pc_record_certification", {
      _org: organizationId,
      _opp: opportunityId,
      _source: "nammux",
      _actor: null,
      _external_actor: interviewer,
      _external_event_id: eventId,
      _input: entrada,
      _changed: mudou,
      _result: resultado,
      _note: typeof data.note === "string" ? data.note.slice(0, 1000) : "",
      _redo: false,
    });
    if (certError) {
      const codigo = /pc:([a-z_]+)/.exec(certError.message ?? "")?.[1] ?? "certification_failed";
      const permanente = codigo !== "certification_failed";
      console.error("certification failed", codigo);
      await admin.from("nammux_sync_events").insert({
        organization_id: organizationId,
        opportunity_id: opportunityId,
        external_event_id: eventId,
        event_type: eventType,
        direction: "inbound",
        status: "error",
        error: codigo,
        summary: { interviewer, changed_fields: mudou },
        occurred_at: envelope.occurred_at ?? null,
      });
      return json(permanente ? 409 : 500, { error: codigo });
    }

    const r = (gravado ?? {}) as { outcome?: string; finalBand?: string | null; finalCommission?: number };
    await admin.from("nammux_sync_events").insert({
      organization_id: organizationId,
      opportunity_id: opportunityId,
      external_event_id: eventId,
      event_type: eventType,
      direction: "inbound",
      status: "processed",
      summary: {
        interviewer,
        outcome: r.outcome ?? null,
        changed_fields: mudou,
        original: { faixa: ativa.band, comissao: Number(ativa.commission) },
        final: { faixa: r.finalBand ?? null, comissao: Number(r.finalCommission ?? 0) },
      },
      occurred_at: envelope.occurred_at ?? null,
    });

    return json(200, {
      ok: true,
      outcome: r.outcome ?? null,
      final: { faixa: r.finalBand ?? null, comissao: Number(r.finalCommission ?? 0) },
      changed_fields: mudou,
    });
  }

  if (eventType === "process.sync.failed") {
    const message = String(data.error ?? "Falha de sincronização reportada pelo Nammux");
    await admin
      .from("nammux_process_snapshots")
      .update({
        sync_status: "error",
        last_event_id: eventId,
        last_error: message,
        last_synced_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("opportunity_id", opportunityId);
    await admin.from("nammux_sync_events").insert({
      organization_id: organizationId,
      opportunity_id: opportunityId,
      external_event_id: eventId,
      event_type: eventType,
      direction: "inbound",
      status: "error",
      error: message,
      summary: data,
      occurred_at: envelope.occurred_at ?? null,
    });
    return json(200, { ok: true });
  }

  const process = (data.process ?? {}) as Record<string, any>;
  const externalProcessId = String(process.id ?? "");
  if (!externalProcessId) return json(400, { error: "process_id_required" });

  const sourceUpdatedAt = process.updated_at ? String(process.updated_at) : null;
  const { data: current } = await admin
    .from("nammux_process_snapshots")
    .select("source_updated_at")
    .eq("organization_id", organizationId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  const stale =
    !!current?.source_updated_at &&
    !!sourceUpdatedAt &&
    new Date(sourceUpdatedAt).getTime() < new Date(current.source_updated_at).getTime();

  if (!stale) {
    const { error: snapshotError } = await admin
      .from("nammux_process_snapshots")
      .upsert(
        {
          organization_id: organizationId,
          opportunity_id: opportunityId,
          external_process_id: externalProcessId,
          external_contact_id: data.external_contact_id ?? null,
          process_title: process.title ?? null,
          cnj: process.cnj ?? null,
          internal_number: process.internal_number ?? null,
          phase: process.phase ?? null,
          stage_id: process.stage_id ?? null,
          stage_name: process.stage_name ?? null,
          status_id: process.status_id ?? null,
          status_code: process.status_code ?? null,
          status_name: process.status_name ?? null,
          status_changed_at: process.status_changed_at ?? null,
          status_change_reason: process.status_change_reason ?? null,
          status_changed_by_name: process.status_changed_by_name ?? null,
          area_id: process.area_id ?? null,
          area_name: process.area_name ?? null,
          responsible_user_id: process.responsible_user_id ?? null,
          responsible_name: process.responsible_name ?? null,
          distributed_at: process.distributed_at ?? null,
          external_url: process.url ?? null,
          sync_status: "synced",
          last_event_id: eventId,
          last_error: null,
          source_updated_at: sourceUpdatedAt,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,opportunity_id" },
      );
    if (snapshotError) {
      console.error("snapshot upsert failed", snapshotError);
      return json(500, { error: "snapshot_upsert_failed" });
    }

    await admin.from("external_mappings").upsert(
      {
        organization_id: organizationId,
        integration_slug: "nammux",
        entity_type: "opportunity",
        internal_id: opportunityId,
        external_id: externalProcessId,
        external_metadata: { source_event_id: eventId },
        sync_status: "synced",
        sync_error: null,
        last_synced_at: new Date().toISOString(),
      },
      {
        onConflict: "organization_id,integration_slug,entity_type,internal_id",
      },
    );
  }

  await admin.from("nammux_sync_events").insert({
    organization_id: organizationId,
    opportunity_id: opportunityId,
    external_event_id: eventId,
    event_type: eventType,
    direction: "inbound",
    status: stale ? "conflict" : "processed",
    summary: {
      external_process_id: externalProcessId,
      stage_name: process.stage_name ?? null,
      status_code: process.status_code ?? null,
      status_name: process.status_name ?? null,
      status_change_reason: process.status_change_reason ?? null,
      ignored_as_stale: stale,
    },
    occurred_at: envelope.occurred_at ?? null,
  });

  return json(200, {
    ok: true,
    opportunity_id: opportunityId,
    external_process_id: externalProcessId,
    ignored_as_stale: stale,
  });
});

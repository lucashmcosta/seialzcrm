// Handler de outbound Seialz -> Kommo.
// target_action = "upsert"
// Cobre: contact.created/updated, opportunity.created/updated/stage_changed.

import { Classification, type Handler, type HandlerResult } from "./types.ts";
import { fetchWithClassification } from "./http.ts";

interface KommoConfig {
  subdomain: string;
  access_token: string;
  // Mapeamento Seialz pipeline_stage_id -> { pipeline_id, status_id } no Kommo.
  // Suporta dois formatos legados:
  //   { "<seialz_stage_id>": "<kommo_status_id>" }              -> assume pipeline default
  //   { "<seialz_stage_id>": { pipeline_id, status_id } }       -> recomendado
  stage_mapping?: Record<string, string | { pipeline_id: number; status_id: number }>;
  // Pipeline default quando o mapping vier no formato legado simples
  default_pipeline_id?: number;
}

function sanitizeSubdomain(raw: string): string {
  return (raw || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\.kommo\.com$/i, "")
    .replace(/\.amocrm\.com$/i, "")
    .replace(/\s+/g, "");
}

function kommoBaseUrl(subdomain: string): string {
  const sub = sanitizeSubdomain(subdomain);
  return `https://${sub}.kommo.com`;
}

function authHeaders(token: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "Seialz-Integration-Worker/1.0",
  };
}

// deno-lint-ignore no-explicit-any
function pickKommoIdFromResponse(parsed: any): string | undefined {
  // Kommo v4 retorna { _embedded: { contacts/leads: [{ id, ... }] } }
  const embedded = parsed?._embedded;
  if (!embedded) return undefined;
  const list = embedded.contacts || embedded.leads;
  if (Array.isArray(list) && list.length > 0 && list[0]?.id != null) {
    return String(list[0].id);
  }
  return undefined;
}

function resolveStageMapping(
  cfg: KommoConfig,
  seialzStageId: string | null | undefined,
): { pipeline_id: number; status_id: number } | null {
  if (!seialzStageId || !cfg.stage_mapping) return null;
  const raw = cfg.stage_mapping[seialzStageId];
  if (raw == null) return null;
  if (typeof raw === "string" || typeof raw === "number") {
    if (!cfg.default_pipeline_id) return null;
    return { pipeline_id: Number(cfg.default_pipeline_id), status_id: Number(raw) };
  }
  if (typeof raw === "object" && raw.pipeline_id && raw.status_id) {
    return { pipeline_id: Number(raw.pipeline_id), status_id: Number(raw.status_id) };
  }
  return null;
}

// ---------------- Loaders ----------------

// deno-lint-ignore no-explicit-any
async function loadKommoConfig(supabase: any, organizationId: string): Promise<KommoConfig | null> {
  const { data, error } = await supabase
    .from("organization_integrations")
    .select("config_values, is_enabled, integration:admin_integrations!inner(slug)")
    .eq("organization_id", organizationId)
    .eq("admin_integrations.slug", "kommo")
    .eq("is_enabled", true)
    .maybeSingle();
  if (error || !data) return null;
  const cfg = (data.config_values ?? {}) as Partial<KommoConfig>;
  if (!cfg.subdomain || !cfg.access_token) return null;
  return cfg as KommoConfig;
}

async function getExternalId(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  organizationId: string,
  entityType: "contact" | "opportunity",
  internalId: string,
): Promise<string | undefined> {
  // Preferência: external_mappings (canônico no novo sistema)
  const { data: mapping } = await supabase
    .from("external_mappings")
    .select("external_id")
    .eq("organization_id", organizationId)
    .eq("integration_slug", "kommo")
    .eq("entity_type", entityType)
    .eq("internal_id", internalId)
    .maybeSingle();
  if (mapping?.external_id) return String(mapping.external_id);

  // Fallback: source_external_id legado vindo do importer
  const table = entityType === "contact" ? "contacts" : "opportunities";
  const { data: row } = await supabase
    .from(table)
    .select("source, source_external_id")
    .eq("id", internalId)
    .maybeSingle();
  if (row?.source === "kommo" && row?.source_external_id) {
    // Importer legado salva como "kommo_<id>"; Kommo API espera só "<id>".
    return String(row.source_external_id).replace(/^kommo_/i, "");
  }
  return undefined;
}

// ---------------- Body builders ----------------

// deno-lint-ignore no-explicit-any
function buildContactBody(payload: any): Record<string, unknown> {
  const fullName = payload.full_name ?? payload.name ?? "Sem nome";
  const customFields: Array<Record<string, unknown>> = [];

  // phones
  const phones: string[] = [];
  if (payload.phone) phones.push(String(payload.phone));
  if (Array.isArray(payload.phones)) phones.push(...payload.phones.filter(Boolean).map(String));
  if (phones.length) {
    customFields.push({
      field_code: "PHONE",
      values: phones.map((p) => ({ value: p, enum_code: "WORK" })),
    });
  }

  // emails
  const emails: string[] = [];
  if (payload.email) emails.push(String(payload.email));
  if (Array.isArray(payload.emails)) emails.push(...payload.emails.filter(Boolean).map(String));
  if (emails.length) {
    customFields.push({
      field_code: "EMAIL",
      values: emails.map((e) => ({ value: e, enum_code: "WORK" })),
    });
  }

  const body: Record<string, unknown> = { name: fullName };
  if (customFields.length) body.custom_fields_values = customFields;
  return body;
}

function buildLeadBody(
  // deno-lint-ignore no-explicit-any
  payload: any,
  cfg: KommoConfig,
): { body: Record<string, unknown>; mappingError?: string } {
  const body: Record<string, unknown> = {
    name: payload.title ?? "Oportunidade",
  };
  if (payload.amount != null) body.price = Math.round(Number(payload.amount));

  const mapped = resolveStageMapping(cfg, payload.pipeline_stage_id);
  if (payload.pipeline_stage_id && !mapped) {
    return {
      body,
      mappingError: `Stage ${payload.pipeline_stage_id} sem mapeamento em config_values.stage_mapping`,
    };
  }
  if (mapped) {
    body.pipeline_id = mapped.pipeline_id;
    body.status_id = mapped.status_id;
  }
  return { body };
}

// ---------------- Handler ----------------

export const kommoUpsertHandler: Handler = async (ctx): Promise<HandlerResult> => {
  // Producer guarda aggregate_type/aggregate_id; o tipo TS antigo dizia entity_type/entity_id.
  // deno-lint-ignore no-explicit-any
  const evt = ctx.event as any;
  const aggregateType: string = evt.aggregate_type ?? evt.entity_type;
  const aggregateId: string = evt.aggregate_id ?? evt.entity_id;
  const eventType: string = evt.event_type;
  const payload = (evt.payload ?? {}) as Record<string, unknown>;

  if (aggregateType !== "contact" && aggregateType !== "opportunity") {
    return {
      classification: Classification.Permanent,
      error: `kommo handler does not support aggregate_type=${aggregateType}`,
    };
  }

  const cfg = await loadKommoConfig(ctx.supabase, ctx.event.organization_id);
  if (!cfg) {
    return {
      classification: Classification.Permanent,
      error: "Kommo integration not configured or disabled for this organization",
    };
  }

  const baseUrl = kommoBaseUrl(cfg.subdomain);
  const headers = authHeaders(cfg.access_token);
  const entityType = aggregateType as "contact" | "opportunity";
  const externalId = await getExternalId(ctx.supabase, ctx.event.organization_id, entityType, aggregateId);

  // ---- Build body + URL ----
  let url: string;
  let method: "POST" | "PATCH";
  let body: Record<string, unknown>;

  if (entityType === "contact") {
    const contactBody = buildContactBody(payload);
    if (externalId) {
      method = "PATCH";
      url = `${baseUrl}/api/v4/contacts/${externalId}`;
      body = contactBody;
    } else {
      method = "POST";
      url = `${baseUrl}/api/v4/contacts`;
      body = { ...contactBody };
      // Kommo POST em coleção espera array
    }
  } else {
    const { body: leadBody, mappingError } = buildLeadBody(payload, cfg);
    if (mappingError && eventType === "opportunity.stage_changed") {
      return { classification: Classification.Permanent, error: mappingError };
    }
    if (externalId) {
      method = "PATCH";
      url = `${baseUrl}/api/v4/leads/${externalId}`;
      body = leadBody;
    } else {
      method = "POST";
      url = `${baseUrl}/api/v4/leads`;
      body = leadBody;
    }
  }

  // POST de criação na v4 espera array; PATCH em /:id espera objeto
  const finalBody = method === "POST" ? [body] : body;

  const res = await fetchWithClassification(url, {
    method,
    headers,
    body: JSON.stringify(finalBody),
  });

  let parsed: unknown;
  try {
    parsed = res.body ? JSON.parse(res.body) : undefined;
  } catch {
    parsed = res.body ? { raw: res.body.slice(0, 2000) } : undefined;
  }

  // 401 do Kommo geralmente significa token inválido/expirado -> permanent (admin precisa reconectar)
  let classification = res.classification;
  if (res.status === 401 || res.status === 403) {
    classification = Classification.Permanent;
  }

  let returnedExternalId: string | undefined;
  if (classification === Classification.Success && method === "POST") {
    returnedExternalId = pickKommoIdFromResponse(parsed);
  }

  return {
    classification,
    httpStatus: res.status,
    durationMs: res.durationMs,
    error: res.error,
    externalPayload: (parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : undefined),
    entityType,
    internalId: aggregateId,
    externalId: returnedExternalId ?? externalId,
  };
};

import { createClient } from "jsr:@supabase/supabase-js@2";
import { featureFlagEnabled } from "../_shared/feature-flags.ts";

// ============================================================
// Inbox v2 — shadow ingest helper (best-effort, NUNCA quebra legado)
// ============================================================
// deno-lint-ignore no-explicit-any
async function shadowIngestSuvSign(opts: {
  supabase: any;
  req: Request;
  payload: any;
  rawHeaders: Record<string, string>;
  orgId: string | null;
  signatureValid: boolean | null;
}) {
  const { supabase, req, payload, rawHeaders, orgId, signatureValid } = opts;
  const traceId = crypto.randomUUID();
  const externalId =
    payload?.data?.document?.id ?? payload?.event_id ?? null;
  const eventType = payload?.event ?? "unknown";
  const idemKey = `suvsign:${externalId ?? "no-id"}:${eventType}`;

  try {
    const enabled = await featureFlagEnabled(
      supabase,
      "inbox_v2.ingest.suvsign",
      orgId,
    );
    if (!enabled) return;

    const { error } = await supabase
      .from("integration_inbound_events")
      .insert({
        integration_slug: "suvsign",
        source_event: eventType,
        external_id: externalId,
        idempotency_key: idemKey,
        organization_id: orgId,
        raw_payload: payload,
        raw_headers: rawHeaders,
        http_method: req.method,
        request_path: new URL(req.url).pathname,
        event_version: 1,
        trace_id: traceId,
        signature_valid: signatureValid,
        signature_algo: signatureValid === null ? null : "hmac-sha256",
        source_ip: req.headers.get("x-forwarded-for") ?? null,
        headers: rawHeaders,
        shadow_mode: true, // CRÍTICO: dispatcher v2 ignora
        process_status: "received",
        handler_key: "suvsign.v1",
      });

    if (error && error.code !== "23505" /* unique_violation = duplicata esperada */) {
      console.error(JSON.stringify({
        level: "error",
        msg: "inbox_v2.shadow_insert_failed",
        trace_id: traceId,
        integration_slug: "suvsign",
        external_id: externalId,
        event_type: eventType,
        organization_id: orgId,
        pg_code: error.code,
        pg_message: error.message,
      }));
      // Best-effort: registra incidente
      supabase.from("integration_inbound_ingest_errors").insert({
        trace_id: traceId,
        integration_slug: "suvsign",
        external_id: externalId,
        event_type: eventType,
        organization_id: orgId,
        error_code: error.code ?? "unknown",
        error_message: (error.message ?? "").slice(0, 2000),
      }).then(() => {}, () => {});
    }
  } catch (e) {
    console.error(JSON.stringify({
      level: "error",
      msg: "inbox_v2.shadow_insert_exception",
      trace_id: traceId,
      integration_slug: "suvsign",
      external_id: externalId,
      event_type: eventType,
      organization_id: orgId,
      exception: String(e),
    }));
  }
}


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-signature",
};

async function verifyHmac(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const rawBody = await req.text();
  let payload: any;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Only handle document.completed
  if (payload.event !== "document.completed") {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const metadata = payload.data?.metadata || {};
  const { deal_id, contact_id, connector_id } = metadata;

  // --- HMAC validation (REQUIRED) ---
  if (!connector_id) {
    return new Response(
      JSON.stringify({ error: "connector_id is required in metadata" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: orgIntegrations } = await supabase
    .from("organization_integrations")
    .select("config_values")
    .eq("is_enabled", true)
    .filter("config_values->>connector_id", "eq", connector_id);

  const orgConfig = orgIntegrations?.[0]?.config_values as any;
  const webhookSecret = orgConfig?.webhook_secret;

  if (!webhookSecret) {
    console.error("No webhook_secret configured for connector_id:", connector_id);
    return new Response(
      JSON.stringify({ error: "Webhook secret not configured for this connector" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const signature = req.headers.get("x-webhook-signature") || "";
  const valid = await verifyHmac(rawBody, signature, webhookSecret);
  if (!valid) {
    console.error("HMAC validation failed for connector_id:", connector_id);
    return new Response(
      JSON.stringify({ error: "Invalid signature" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // --- Find opportunity ---
  if (!deal_id) {
    console.error("No deal_id in metadata");
    return new Response(
      JSON.stringify({ error: "deal_id is required in metadata" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const { data: opportunity, error: oppError } = await supabase
    .from("opportunities")
    .select("id, organization_id, title")
    .eq("id", deal_id)
    .maybeSingle();

  if (oppError || !opportunity) {
    console.error("Opportunity not found:", deal_id, oppError);
    return new Response(
      JSON.stringify({ error: "Opportunity not found" }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const orgId = opportunity.organization_id;
  const document = payload.data?.document || {};
  const signatories = payload.data?.signatories || [];

  // ============================================================
  // Inbox v2 — shadow ingest (best-effort, NUNCA quebra legado)
  // Executa apenas se inbox_v2.ingest.suvsign=true.
  // shadow_mode=true garante que dispatcher v2 ignore.
  // ============================================================
  {
    const rawHeaders: Record<string, string> = {};
    req.headers.forEach((v, k) => { rawHeaders[k] = v; });
    // Não aguardamos para não impactar latência do legado; falhas são logadas internamente.
    shadowIngestSuvSign({
      supabase,
      req,
      payload,
      rawHeaders,
      orgId,
      signatureValid: true, // HMAC já validado acima (ou ausente quando connector_id não definido)
    }).catch(() => {});
  }



  // --- Download signed PDF ---
  const fileUrl = document.file_url;
  if (!fileUrl) {
    console.error("No file_url in document data");
    return new Response(
      JSON.stringify({ error: "file_url is required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // SSRF guard: restrict file_url to known SuvSign hosts
  const ALLOWED_FILE_HOSTS = ["suvsign.com", "suvsign.com.br", "amazonaws.com", "vpysvlbfsvomwrgbpybc.supabase.co"];
  try {
    const parsed = new URL(fileUrl);
    if (parsed.protocol !== "https:") throw new Error("non-https file_url");
    const host = parsed.hostname.toLowerCase();
    const allowed = ALLOWED_FILE_HOSTS.some((h) => host === h || host.endsWith("." + h));
    if (!allowed) throw new Error(`disallowed file_url host: ${host}`);
  } catch (err) {
    console.error("Rejected file_url:", fileUrl, err);
    return new Response(
      JSON.stringify({ error: "Invalid file_url" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let pdfBuffer: ArrayBuffer;
  try {
    const pdfResponse = await fetch(fileUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
    }
    pdfBuffer = await pdfResponse.arrayBuffer();
  } catch (err) {
    console.error("Error downloading PDF:", err);
    return new Response(
      JSON.stringify({ error: "Failed to download PDF" }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // --- Upload PDF to storage ---
  const timestamp = Date.now();
  const fileName = `${document.title || "documento"}_assinado.pdf`
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${opportunity.id}/${timestamp}_${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("attachments")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    console.error("Error uploading PDF:", uploadError);
    return new Response(
      JSON.stringify({ error: "Failed to upload PDF" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // --- Create attachment record ---
  const { error: attachError } = await supabase.from("attachments").insert({
    organization_id: orgId,
    entity_type: "opportunity",
    entity_id: opportunity.id,
    file_name: `${document.title || "Documento"} - Assinado.pdf`,
    storage_path: storagePath,
    bucket: "attachments",
    mime_type: "application/pdf",
    size_bytes: pdfBuffer.byteLength,
  });

  if (attachError) {
    console.error("Error creating attachment record:", attachError);
  }

  // --- Create timeline activity ---
  const signatoryNames = signatories
    .map((s: any) => s.name || s.email)
    .join(", ");

  const completedAt = document.completed_at
    ? new Date(document.completed_at).toLocaleString("pt-BR", {
        dateStyle: "long",
        timeStyle: "short",
      })
    : "";

  const { error: activityError } = await supabase.from("activities").insert({
    organization_id: orgId,
    opportunity_id: opportunity.id,
    contact_id: contact_id || null,
    activity_type: "system",
    title: `Documento assinado: ${document.title || "Sem título"}`,
    body: `Assinado${completedAt ? ` em ${completedAt}` : ""}${signatoryNames ? ` por ${signatoryNames}` : ""}`,
  });

  if (activityError) {
    console.error("Error creating activity:", activityError);
  }

  console.log(
    `SuvSign webhook processed: document ${document.id} for opportunity ${opportunity.id}`
  );

  return new Response(
    JSON.stringify({ ok: true, opportunity_id: opportunity.id }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});

// Secure server-to-server endpoint for Nammux to download Seialz attachments.
// GET /functions/v1/nammux-download-attachment?attachment_id=<uuid>
//
// Required headers:
//   X-Nammux-Signature: sha256=<hex HMAC>
//   X-Nammux-Timestamp: <unix seconds>
//   X-Nammux-Organization-Id: <uuid configured in Seialz as cfg.nammux_organization_id>
//   X-Seialz-Organization-Id: <uuid of the Seialz org that owns the attachment>
//
// Signature base string:
//   `${timestamp}.${method}.${path}.${query}`
// Secret: organization_integrations.config_values.download_secret (preferred)
//         falls back to config_values.webhook_secret.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nammux-signature, x-nammux-timestamp, x-nammux-organization-id, x-seialz-organization-id",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const ALLOWED_ENTITY_TYPES = new Set(["contact", "opportunity", "contact_document"]);
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;
const HMAC_DEBUG_ATTACHMENT_ID = "704637de-8248-4464-a9ed-923f8105ce7e";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// deno-lint-ignore no-explicit-any
async function logAudit(supabase: any, row: Record<string, unknown>) {
  try {
    await supabase.from("integration_audit_logs").insert({
      action: "nammux.download_attachment",
      entity_type: "attachment",
      entity_id: row.attachment_id ?? null,
      organization_id: row.organization_id ?? null,
      metadata: row,
    });
  } catch (_e) { /* swallow audit failures */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const attachmentId = url.searchParams.get("attachment_id") ?? "";
  const sigHeader = req.headers.get("x-nammux-signature") ?? "";
  const tsHeader = req.headers.get("x-nammux-timestamp") ?? "";
  const nammuxOrgId = (req.headers.get("x-nammux-organization-id") ?? "").trim();
  const seialzOrgId = (req.headers.get("x-seialz-organization-id") ?? "").trim();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const baseAudit = {
    attachment_id: attachmentId || null,
    organization_id: seialzOrgId || null,
    requested_by: "nammux",
    target_nammux_organization_id: nammuxOrgId || null,
  };

  // Basic header presence
  if (!sigHeader || !tsHeader || !nammuxOrgId || !seialzOrgId) {
    await logAudit(supabase, { ...baseAudit, status: 401, error: "missing_headers" });
    return json({ error: "Missing required headers" }, 401);
  }
  if (!attachmentId) {
    await logAudit(supabase, { ...baseAudit, status: 400, error: "missing_attachment_id" });
    return json({ error: "attachment_id is required" }, 400);
  }

  // Timestamp tolerance
  const tsNum = Number(tsHeader);
  if (!Number.isFinite(tsNum) || Math.abs(Math.floor(Date.now() / 1000) - tsNum) > TIMESTAMP_TOLERANCE_SECONDS) {
    await logAudit(supabase, { ...baseAudit, status: 401, error: "stale_timestamp" });
    return json({ error: "Stale or invalid timestamp" }, 401);
  }

  // Load Nammux integration config for this Seialz org
  const { data: row } = await supabase
    .from("organization_integrations")
    .select("config_values, is_enabled, integration:admin_integrations!inner(slug)")
    .eq("organization_id", seialzOrgId)
    .eq("admin_integrations.slug", "nammux")
    .maybeSingle();

  if (!row || row.is_enabled === false) {
    await logAudit(supabase, { ...baseAudit, status: 403, error: "integration_not_enabled" });
    return json({ error: "Nammux integration not enabled for this organization" }, 403);
  }
  const cfg = (row.config_values ?? {}) as Record<string, unknown>;
  const cfgTargetOrgId = String(cfg.nammux_organization_id ?? "").trim();
  if (!cfgTargetOrgId || cfgTargetOrgId !== nammuxOrgId) {
    await logAudit(supabase, { ...baseAudit, status: 403, error: "nammux_org_mismatch" });
    return json({ error: "Nammux organization mismatch" }, 403);
  }

  const secret = String(cfg.download_secret ?? cfg.webhook_secret ?? "").trim();
  if (!secret) {
    await logAudit(supabase, { ...baseAudit, status: 500, error: "missing_secret" });
    return json({ error: "Download secret not configured" }, 500);
  }

  // Verify signature: `${timestamp}.${method}.${path}.${query}`
  const query = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  const baseString = `${tsHeader}.${req.method}.${url.pathname}.${query}`;
  const expected = await hmacSha256Hex(secret, baseString);
  const provided = sigHeader.startsWith("sha256=") ? sigHeader.slice(7) : sigHeader;
  const signatureMatch = timingSafeEqual(expected, provided);
  // Temporary safe debug log for the real Nammux retry (no full secret exposed).
  if (attachmentId === HMAC_DEBUG_ATTACHMENT_ID) {
    console.log({
      marker: "download_hmac_debug_v1",
      attachment_id: attachmentId,
      received_ts: tsHeader,
      method: req.method,
      pathname: url.pathname,
      query,
      base_string: baseString,
      signature_header: sigHeader,
      received_sig_prefix8: provided.slice(0, 8),
      expected_sig_prefix8: expected.slice(0, 8),
      signature_match: signatureMatch,
      secret_source: cfg.download_secret ? "download_secret" : "webhook_secret",
      secret_prefix4: secret.slice(0, 4),
      secret_len: secret.length,
      seialz_org_id: seialzOrgId,
      nammux_org_id: nammuxOrgId,
    });
  }
  if (!signatureMatch) {
    await logAudit(supabase, { ...baseAudit, status: 401, error: "invalid_signature" });
    return json({ error: "Invalid signature" }, 401);
  }

  // Load attachment
  const { data: att, error: attErr } = await supabase
    .from("attachments")
    .select("id, organization_id, entity_type, entity_id, bucket, storage_path, file_name, mime_type, size_bytes, deleted_at")
    .eq("id", attachmentId)
    .maybeSingle();

  if (attErr || !att) {
    await logAudit(supabase, { ...baseAudit, status: 404, error: "attachment_not_found" });
    return json({ error: "Attachment not found" }, 404);
  }
  if (att.deleted_at) {
    await logAudit(supabase, { ...baseAudit, status: 410, error: "attachment_deleted" });
    return json({ error: "Attachment has been deleted" }, 410);
  }
  if (att.organization_id !== seialzOrgId) {
    await logAudit(supabase, { ...baseAudit, status: 403, error: "org_mismatch" });
    return json({ error: "Attachment does not belong to this organization" }, 403);
  }
  if (!ALLOWED_ENTITY_TYPES.has(att.entity_type)) {
    await logAudit(supabase, { ...baseAudit, status: 403, error: `entity_type_not_allowed:${att.entity_type}` });
    return json({ error: "Attachment entity type not allowed" }, 403);
  }

  // Download from Storage
  const { data: file, error: dlErr } = await supabase
    .storage
    .from(att.bucket)
    .download(att.storage_path);

  if (dlErr || !file) {
    await logAudit(supabase, { ...baseAudit, status: 502, error: `storage_download_failed:${dlErr?.message ?? "unknown"}` });
    return json({ error: "Failed to download file from storage" }, 502);
  }

  const buf = await file.arrayBuffer();
  const mime = att.mime_type || "application/octet-stream";
  const safeName = att.file_name.replace(/"/g, "");

  await logAudit(supabase, {
    ...baseAudit,
    status: 200,
    bucket: att.bucket,
    storage_path: att.storage_path,
    size_bytes: buf.byteLength,
  });

  return new Response(buf, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": mime,
      "Content-Length": String(buf.byteLength),
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "X-Seialz-Attachment-Id": att.id,
      "X-Seialz-Storage-Path": att.storage_path,
    },
  });
});

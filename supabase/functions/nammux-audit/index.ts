// Audit endpoint: reproduces the exact header/envelope construction used by
// the nammux:send_opportunity_won handler and POSTs to httpbin.org/anything
// so we can prove what is actually being sent on the wire.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { organization_id } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row } = await supabase
      .from("organization_integrations")
      .select("config_values, integration:admin_integrations!inner(slug)")
      .eq("organization_id", organization_id)
      .eq("admin_integrations.slug", "nammux")
      .maybeSingle();

    const cfg = (row?.config_values ?? {}) as Record<string, unknown>;
    const seialzOrgId = organization_id as string;
    const targetOrgId = String(cfg.nammux_organization_id ?? "").trim();
    const secret = String(cfg.webhook_secret ?? "").trim();

    const eventId = crypto.randomUUID();
    const idemKey = `nammux.audit.${eventId}`;
    const envelope = {
      event_id: eventId,
      event_type: "audit.dryrun",
      idempotency_key: idemKey,
      organization_id: seialzOrgId,
      target_organization_id: targetOrgId,
      occurred_at: new Date().toISOString(),
      data: { organization_id: seialzOrgId, target_organization_id: targetOrgId },
    };
    const rawBody = JSON.stringify(envelope);
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = await hmacSha256Hex(secret || "noop", `${ts}.${rawBody}`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Seialz-Signature": `sha256=${signature}`,
      "X-Seialz-Timestamp": ts,
      "X-Seialz-Event-Id": eventId,
      "X-Seialz-Event-Type": "audit.dryrun",
      "X-Seialz-Idempotency-Key": idemKey,
      "X-Seialz-Organization-Id": seialzOrgId,
      "X-Seialz-Target-Organization-Id": targetOrgId,
      "User-Agent": "Seialz-Integration-Audit/1.0",
    };

    const echo = await fetch("https://httpbin.org/anything", {
      method: "POST", headers, body: rawBody,
    });
    const echoed = await echo.json();

    return new Response(JSON.stringify({
      config_values_present: row != null,
      nammux_organization_id_in_config: cfg.nammux_organization_id ?? null,
      summary: {
        seialz_organization_id: seialzOrgId,
        nammux_organization_id: targetOrgId,
        "header_X-Seialz-Organization-Id": headers["X-Seialz-Organization-Id"],
        "header_X-Seialz-Target-Organization-Id": headers["X-Seialz-Target-Organization-Id"],
        "envelope.organization_id": envelope.organization_id,
        "envelope.target_organization_id": envelope.target_organization_id,
      },
      headers_sent: headers,
      envelope_sent: envelope,
      httpbin_echoed_headers: echoed?.headers,
      httpbin_echoed_body: echoed?.json,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Nammux: send a signed test event to the configured webhook
// and return HTTP status/duration/error so the UI can show the result.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { organization_id } = await req.json();
    if (!organization_id) {
      return new Response(JSON.stringify({ ok: false, error: "organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row, error } = await supabase
      .from("organization_integrations")
      .select("config_values, is_enabled, integration:admin_integrations!inner(slug)")
      .eq("organization_id", organization_id)
      .eq("admin_integrations.slug", "nammux")
      .maybeSingle();

    if (error || !row) {
      return new Response(
        JSON.stringify({ ok: false, error: "Nammux integration not found for this organization" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cfg = (row.config_values ?? {}) as Record<string, unknown>;
    const url = String(cfg.webhook_url ?? "").trim();
    const secret = String(cfg.webhook_secret ?? "").trim();

    if (!url) {
      return new Response(JSON.stringify({ ok: false, error: "webhook_url não configurado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!secret) {
      return new Response(JSON.stringify({ ok: false, error: "webhook_secret não configurado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetOrgId = String(cfg.nammux_organization_id ?? "").trim();
    if (!targetOrgId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Nammux Organization ID não configurado." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const eventId = crypto.randomUUID();
    const idempotencyKey = `nammux.test.${eventId}`;
    const envelope = {
      event_id: eventId,
      event_type: "connection.test",
      idempotency_key: idempotencyKey,
      organization_id,
      target_organization_id: targetOrgId,
      occurred_at: new Date().toISOString(),
      data: {
        message: "Seialz → Nammux connection test",
        organization_id,
        target_organization_id: targetOrgId,
      },
    };
    const rawBody = JSON.stringify(envelope);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Seialz-Signature": `sha256=${signature}`,
      "X-Seialz-Timestamp": timestamp,
      "X-Seialz-Event-Id": eventId,
      "X-Seialz-Event-Type": "connection.test",
      "X-Seialz-Idempotency-Key": idempotencyKey,
      "X-Seialz-Organization-Id": organization_id,
      "X-Seialz-Target-Organization-Id": targetOrgId,
      "User-Agent": "Seialz-Integration-Worker/1.0 (test)",
    };

    const started = Date.now();
    let status = 0;
    let body = "";
    let networkError: string | null = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: rawBody,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      status = res.status;
      body = (await res.text()).slice(0, 2000);
    } catch (e) {
      networkError = (e as Error).message || "network error";
    }
    const durationMs = Date.now() - started;

    const ok = !networkError && status >= 200 && status < 300;
    let userMessage: string | null = null;
    if (networkError) userMessage = `Endpoint indisponível: ${networkError}`;
    else if (status === 401 || status === 403) userMessage = "Assinatura inválida ou não autorizada";
    else if (!ok) userMessage = `Endpoint respondeu ${status}`;

    return new Response(
      JSON.stringify({
        ok,
        http_status: status,
        duration_ms: durationMs,
        error: userMessage,
        response_body: body,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

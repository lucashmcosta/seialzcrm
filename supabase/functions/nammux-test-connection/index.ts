// Nammux: send a signed test event to the configured webhook
// and return HTTP status/duration/error so the UI can show the result.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { loadActiveIntegrationSecret } from "../_shared/integration-credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function allowedNammuxWebhook(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const allowed = (Deno.env.get("NAMMUX_ALLOWED_WEBHOOK_HOSTS") ?? "rqnbnbbbmhtynuhecavv.supabase.co")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    return allowed.includes(url.hostname.toLowerCase()) ? url : null;
  } catch {
    return null;
  }
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
    const authorization = req.headers.get("authorization") ?? "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) {
      return new Response(JSON.stringify({ ok: false, error: "missing_authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: internalUser } = await supabase
      .from("users")
      .select("id")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    const { data: membership } = internalUser
      ? await supabase
        .from("user_organizations")
        .select("permission_profile_id")
        .eq("user_id", internalUser.id)
        .eq("organization_id", organization_id)
        .eq("is_active", true)
        .maybeSingle()
      : { data: null };
    const { data: profile } = membership
      ? await supabase
        .from("permission_profiles")
        .select("permissions")
        .eq("id", membership.permission_profile_id)
        .maybeSingle()
      : { data: null };
    if ((profile?.permissions as Record<string, unknown> | null)?.can_manage_integrations !== true) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const url = allowedNammuxWebhook(String(cfg.webhook_url ?? "").trim());
    const credential = await loadActiveIntegrationSecret(supabase, organization_id);

    if (!url) {
      return new Response(JSON.stringify({ ok: false, error: "webhook_url não permitido" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!credential) {
      return new Response(JSON.stringify({ ok: false, error: "credencial por organização não configurada" }), {
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
    const signature = await hmacSha256Hex(credential.secret, `${timestamp}.${rawBody}`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Seialz-Signature": `sha256=${signature}`,
      "X-Seialz-Key-Id": credential.keyId,
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

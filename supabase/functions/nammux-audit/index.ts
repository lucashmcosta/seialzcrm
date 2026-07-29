// Local-only integration audit. It never sends credentials or signed payloads
// to third-party echo services.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const authorization = req.headers.get("authorization") ?? "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return json(401, { error: "missing_authorization" });
  const authClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: authData } = await authClient.auth.getUser(accessToken);
  if (!authData.user) return json(401, { error: "unauthorized" });

  const { organization_id: organizationId } = await req.json().catch(() => ({}));
  if (!organizationId) return json(400, { error: "organization_id_required" });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: internalUser } = await admin
    .from("users")
    .select("id")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  const { data: membership } = internalUser
    ? await admin
      .from("user_organizations")
      .select("permission_profile_id")
      .eq("user_id", internalUser.id)
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .maybeSingle()
    : { data: null };
  const { data: profile } = membership
    ? await admin
      .from("permission_profiles")
      .select("permissions")
      .eq("id", membership.permission_profile_id)
      .maybeSingle()
    : { data: null };
  if ((profile?.permissions as Record<string, unknown> | null)?.can_manage_integrations !== true) {
    return json(403, { error: "forbidden" });
  }

  const [{ data: integration }, { data: credentials }, { data: jobs }] = await Promise.all([
    admin
      .from("organization_integrations")
      .select("is_enabled, config_values, integration:admin_integrations!inner(slug)")
      .eq("organization_id", organizationId)
      .eq("admin_integrations.slug", "nammux")
      .maybeSingle(),
    admin
      .from("nammux_integration_credentials")
      .select("key_id, is_active, valid_from, expires_at, created_at")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    admin
      .from("integration_jobs")
      .select("status, last_error, created_at, completed_at")
      .eq("organization_id", organizationId)
      .eq("integration_slug", "nammux")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const config = (integration?.config_values ?? {}) as Record<string, unknown>;
  return json(200, {
    ok: true,
    organization_id: organizationId,
    enabled: integration?.is_enabled === true,
    mapping: {
      nammux_organization_id: config.nammux_organization_id ?? null,
      configured: !!config.nammux_organization_id,
    },
    endpoint: {
      configured: typeof config.webhook_url === "string" && !!config.webhook_url,
      host: typeof config.webhook_url === "string"
        ? (() => {
          try {
            return new URL(config.webhook_url).host;
          } catch {
            return null;
          }
        })()
        : null,
    },
    credentials: credentials ?? [],
    recent_jobs: jobs ?? [],
  });
});

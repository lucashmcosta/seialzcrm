// jsr (Deno-nativo) em vez de npm: reduz o cold start das functions de telefonia
// que importam este módulo (transfer-control/intent/session-token/call-intent).
import { createClient } from "jsr:@supabase/supabase-js@2";

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-organization-id",
    },
  });
}

export function corsPreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-organization-id",
    },
  });
}

export async function requireTelephonyUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const auth = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );
  const admin = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const token = authHeader.slice("Bearer ".length);
  const requestedOrganizationId = req.headers.get("x-organization-id")?.trim();
  if (!requestedOrganizationId) {
    throw new Response("Organization required", { status: 400 });
  }
  const { data: claims, error } = await auth.auth.getClaims(token);
  const authUserId = claims?.claims?.sub;
  if (error || !authUserId) throw new Response("Unauthorized", { status: 401 });

  // Uma query só (era 2 round-trips seriais: users + user_organizations): busca o
  // user já com a membership da org pedida via inner join.
  const { data: user } = await admin
    .from("users")
    .select(
      "id, user_organizations!inner(organization_id, permission_profiles!inner(permissions))",
    )
    .eq("auth_user_id", authUserId)
    .eq("user_organizations.organization_id", requestedOrganizationId)
    .eq("user_organizations.is_active", true)
    .maybeSingle();
  const membership = (user?.user_organizations as unknown as Array<{
    organization_id: string;
    permission_profiles?: { permissions?: Record<string, boolean> };
  }>)?.[0];
  if (!user || !membership) {
    throw new Response("Organization not found", { status: 404 });
  }

  return {
    admin,
    token,
    userId: user.id as string,
    organizationId: membership.organization_id,
    permissions: membership.permission_profiles?.permissions ?? {},
  };
}

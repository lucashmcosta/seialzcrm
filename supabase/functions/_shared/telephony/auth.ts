import { createClient } from "npm:@supabase/supabase-js@2";

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
  const { data: claims, error } = await auth.auth.getClaims(token);
  const authUserId = claims?.claims?.sub;
  if (error || !authUserId) throw new Response("Unauthorized", { status: 401 });

  const { data: user } = await admin
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .single();
  if (!user) throw new Response("User not found", { status: 404 });

  const requestedOrganizationId = req.headers.get("x-organization-id")?.trim();
  if (!requestedOrganizationId) {
    throw new Response("Organization required", { status: 400 });
  }

  const { data: membership } = await admin
    .from("user_organizations")
    .select("organization_id, permission_profiles!inner(permissions)")
    .eq("user_id", user.id)
    .eq("organization_id", requestedOrganizationId)
    .eq("is_active", true)
    .single();
  if (!membership) {
    throw new Response("Organization not found", { status: 404 });
  }

  return {
    admin,
    token,
    userId: user.id as string,
    organizationId: membership.organization_id as string,
    permissions: (membership.permission_profiles as unknown as {
      permissions?: Record<string, boolean>;
    })?.permissions ?? {},
  };
}

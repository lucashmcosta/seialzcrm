// Authorization helper for BYOK edge functions.
// Flow: user JWT (anon key) -> getClaims -> map auth.uid -> internal users.id
// -> check has_org_role(internal_id, org_id, 'admin') via service-role client.
// Service-role is ONLY used server-side and never returned to the client.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type AuthOk = {
  ok: true;
  authUid: string;
  userId: string; // internal users.id
  organizationId: string;
  admin: SupabaseClient; // service-role client; NEVER pass to caller
};
export type AuthErr = { ok: false; status: number; error: string };

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Require that the caller is an active admin of the given organization.
 * Caller must pass Authorization: Bearer <user JWT>.
 */
export async function requireOrgAdmin(
  req: Request,
  organizationId: string,
): Promise<AuthOk | AuthErr> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "missing_bearer_token" };
  }
  const jwt = authHeader.slice(7).trim();

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(jwt);
  if (claimsErr || !claimsData?.claims?.sub) {
    return { ok: false, status: 401, error: "invalid_jwt" };
  }
  const authUid = claimsData.claims.sub as string;

  const admin = serviceClient();

  // Map auth.uid -> internal users.id
  const { data: userRow, error: userErr } = await admin
    .from("users")
    .select("id")
    .eq("auth_user_id", authUid)
    .maybeSingle();
  if (userErr || !userRow?.id) {
    return { ok: false, status: 403, error: "user_not_found" };
  }
  const userId = userRow.id as string;

  const { data: isAdmin, error: roleErr } = await admin.rpc("has_org_role", {
    _user_id: userId,
    _org_id: organizationId,
    _role: "Admin",
  });
  if (roleErr) return { ok: false, status: 500, error: "role_check_failed" };
  if (!isAdmin) return { ok: false, status: 403, error: "not_org_admin" };

  return { ok: true, authUid, userId, organizationId, admin };
}

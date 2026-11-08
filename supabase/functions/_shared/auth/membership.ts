// Autorização de chamador para edge functions com verify_jwt=false que recebem
// `organization_id` no body. Três tipos de chamador (mesma ordem/semântica do
// validateAuth que existia em meta-discover-ad-accounts / meta-ads-manager-save):
//   1) service_role key (env)                → "service"  (crons/backend)
//   2) token interno do Vault                → "internal" (funções chamando funções)
//   3) JWT de usuário (getClaims → sub)      → "user"     → EXIGE membership ativa
// Membership = public.users(auth_user_id) → public.user_organizations(user_id,
// organization_id, is_active = true). Fail-closed: qualquer erro de leitura = não membro.

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export type OrgCaller =
  | { ok: true; kind: "service" | "internal" }
  | { ok: true; kind: "user"; authUserId: string }
  | { ok: false; error: string };

export async function resolveCaller(req: Request, admin: AdminClient): Promise<OrgCaller> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, error: "Missing Bearer token" };
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return { ok: false, error: "Missing Bearer token" };

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && token === serviceKey) return { ok: true, kind: "service" };

  try {
    const { data: internal } = await admin.rpc("get_internal_function_auth_token");
    if (internal && token === internal) return { ok: true, kind: "internal" };
  } catch (_e) { /* ignore */ }

  try {
    const { data, error } = await admin.auth.getClaims(token);
    const sub = data?.claims?.sub;
    if (!error && typeof sub === "string" && sub) return { ok: true, kind: "user", authUserId: sub };
  } catch (_e) { /* ignore */ }

  return { ok: false, error: "Invalid token" };
}

export async function isActiveOrgMember(
  admin: AdminClient,
  authUserId: string,
  organizationId: string,
): Promise<boolean> {
  try {
    const { data: users, error: uErr } = await admin
      .from("users").select("id").eq("auth_user_id", authUserId);
    if (uErr || !Array.isArray(users) || users.length === 0) return false;
    const { data: rows, error: mErr } = await admin
      .from("user_organizations").select("user_id")
      .in("user_id", users.map((u: { id: string }) => u.id))
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .limit(1);
    return !mErr && Array.isArray(rows) && rows.length > 0;
  } catch (_e) {
    return false;
  }
}

/** service/internal passam direto; usuário precisa de membership ativa na org. */
export async function callerCanAccessOrg(
  admin: AdminClient,
  caller: Extract<OrgCaller, { ok: true }>,
  organizationId: string,
): Promise<boolean> {
  if (caller.kind !== "user") return true;
  return await isActiveOrgMember(admin, caller.authUserId, organizationId);
}

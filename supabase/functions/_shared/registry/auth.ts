import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { isFunctionKeyCall } from "../auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type RegistryAuth =
  | {
      ok: true;
      admin: SupabaseClient;
      userId: string;
      organizationId: string;
      permissions: Record<string, boolean>;
    }
  | { ok: false; status: number; error: string };

/**
 * Quem consulta: o usuário logado (JWT) ou, numa chamada interna com a chave da função
 * (ex.: o agente de IA verificando o CPF da cliente), o usuário responsável informado em
 * `actingUserId`. Nos dois casos valem as mesmas regras: membro ativo, permissão e org ativa no BR.
 */
export async function requireRegistryAccess(
  req: Request,
  organizationId: string,
  actingUserId?: string | null,
): Promise<RegistryAuth> {
  const authorization = req.headers.get("authorization") ?? "";
  const jwt = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return { ok: false, status: 401, error: "missing_authorization" };

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let internalUser: { id: string } | null = null;
  if (actingUserId && isFunctionKeyCall(req)) {
    const { data } = await admin.from("users").select("id").eq("id", actingUserId).maybeSingle();
    internalUser = data ?? null;
  } else {
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !authData.user) {
      return { ok: false, status: 401, error: "invalid_authorization" };
    }
    const { data } = await admin
      .from("users")
      .select("id")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    internalUser = data ?? null;
  }
  if (!internalUser?.id) return { ok: false, status: 403, error: "user_not_found" };

  const { data: membership } = await admin
    .from("user_organizations")
    .select("permission_profile_id")
    .eq("user_id", internalUser.id)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();
  if (!membership) return { ok: false, status: 403, error: "organization_access_denied" };

  const { data: profile } = await admin
    .from("permission_profiles")
    .select("permissions")
    .eq("id", membership.permission_profile_id)
    .maybeSingle();
  const permissions = (profile?.permissions ?? {}) as Record<string, boolean>;
  if (permissions.can_edit_contacts !== true && permissions.can_manage_settings !== true) {
    return { ok: false, status: 403, error: "registry_lookup_forbidden" };
  }

  const { data: organization } = await admin
    .from("organizations")
    .select("operating_country_code, suspended_at")
    .eq("id", organizationId)
    .maybeSingle();
  if (!organization || organization.suspended_at) {
    return { ok: false, status: 403, error: "organization_inactive" };
  }
  if (organization.operating_country_code !== "BR") {
    return { ok: false, status: 409, error: "registry_lookup_requires_br" };
  }

  return {
    ok: true,
    admin,
    userId: internalUser.id,
    organizationId,
    permissions,
  };
}

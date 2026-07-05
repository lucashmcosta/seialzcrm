// Validates that the request was made with a valid service_role JWT for this project.
// More robust than string-matching against SUPABASE_SERVICE_ROLE_KEY env var,
// which can drift after Supabase key rotation.

import { createClient } from "jsr:@supabase/supabase-js@2";

export function validateServiceRoleAuth(req: Request): { ok: boolean; error?: string } {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, error: "Missing Bearer token" };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "Invalid JWT format" };
  }

  try {
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));

    if (payload.role !== "service_role") {
      return { ok: false, error: `Invalid role: ${payload.role}` };
    }

    if (payload.iss !== "supabase") {
      return { ok: false, error: `Invalid issuer: ${payload.iss}` };
    }

    const projectRef = new URL(Deno.env.get("SUPABASE_URL")!).hostname.split(".")[0];
    if (payload.ref !== projectRef) {
      return { ok: false, error: `Invalid project ref: ${payload.ref}` };
    }

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, error: "Token expired" };
    }

    return { ok: true };
  } catch (_e) {
    return { ok: false, error: "Invalid JWT payload" };
  }
}

// ============================================================================
// EDGE_AUTH — validação de chamador com rollout faseado.
// Plano: docs/operations/proposals/2026-07-05-edge-auth-hardening.md
//
// EDGE_AUTH_ENFORCE:
//   "off"     → nenhuma checagem (rollback de emergência, sem redeploy)
//   "log"     → valida e loga would-deny, NUNCA rejeita (Fase 0 — default)
//   "enforce" → rejeita chamador inválido (Fase 2, só após observação)
// ============================================================================

export type EdgeAuthMode = "off" | "log" | "enforce";

export function edgeAuthMode(): EdgeAuthMode {
  const v = (Deno.env.get("EDGE_AUTH_ENFORCE") || "log").toLowerCase().trim();
  if (v === "off" || v === "enforce") return v;
  return "log";
}

export type CallerAuth =
  | { ok: true; kind: "service_role" | "user"; userId?: string }
  | { ok: false; error: string };

// Aceita service_role OU JWT de usuário com vínculo ativo na organização.
// Nunca lança: qualquer falha vira { ok: false } para o caller decidir
// (em modo "log" a falha é apenas observada).
export async function validateCallerAuth(
  req: Request,
  organizationId: string,
): Promise<CallerAuth> {
  const sr = validateServiceRoleAuth(req);
  if (sr.ok) return { ok: true, kind: "service_role" };

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, error: "missing_bearer" };

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return { ok: false, error: "invalid_user_jwt" };

    const { data: membership } = await admin
      .from("users")
      .select("id, user_organizations!inner(organization_id, is_active)")
      .eq("auth_user_id", userData.user.id)
      .eq("user_organizations.organization_id", organizationId)
      .eq("user_organizations.is_active", true)
      .maybeSingle();

    if (!membership) return { ok: false, error: "no_active_membership" };
    return { ok: true, kind: "user", userId: (membership as { id: string }).id };
  } catch (e) {
    return { ok: false, error: `auth_check_error: ${(e as Error)?.message ?? e}` };
  }
}

// Log estruturado de would-deny para a fase de observação. Não loga o token.
export function logAuthObservation(fnName: string, req: Request, reason: string): void {
  const authHeader = req.headers.get("authorization") ?? "";
  let bearerRole = "none";
  try {
    const parts = authHeader.replace(/^Bearer\s+/i, "").split(".");
    if (parts.length === 3) {
      const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      bearerRole = JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4))).role ?? "unknown";
    }
  } catch (_e) { /* fingerprint best-effort */ }
  console.warn("[AUTH-OBSERVE] would-deny", JSON.stringify({
    fn: fnName,
    reason,
    bearer_role: bearerRole,
    user_agent: req.headers.get("user-agent") ?? null,
    x_forwarded_for: req.headers.get("x-forwarded-for") ?? null,
    x_client_info: req.headers.get("x-client-info") ?? null,
  }));
}

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

  // Chave interna no formato novo do Supabase (sb_secret_..., não é JWT). As funções
  // chamam umas às outras com SUPABASE_SERVICE_ROLE_KEY, que hoje está nesse formato;
  // sem isto toda chamada interna aparecia como "não autorizada" (18/11).
  if (isProjectSecretKey(token)) return { ok: true };

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

// Igual à chave secreta do projeto (comparação em tempo constante). Só aceita chave
// não-JWT: o JWT legado continua validado pelas claims abaixo.
function isProjectSecretKey(token: string): boolean {
  const secret = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!secret || secret.split(".").length === 3 || token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

// ============================================================================
// Chave interna conferida por IGUALDADE EXATA.
//
// `validateServiceRoleAuth` acima confere um JWT só pelas claims (role, iss,
// ref, exp): a assinatura não é verificada. Em função com verify_jwt = false o
// gateway também não verifica, então um token montado por qualquer pessoa com
// `role: service_role` passava como chamada interna.
//
// `verifyServiceRoleAuth` só reconhece as duas chaves internas de verdade:
//   - SUPABASE_SERVICE_ROLE_KEY, a variável de ambiente da função;
//   - a chave do cofre que os jobs do pg_cron enviam
//     (public.get_internal_function_auth_token(), restrita a service_role).
//
// SERVICE_AUTH_STRICT (rollout em duas fases, como o EDGE_AUTH_ENFORCE):
//   "log"     → continua aceitando pelas claims, e registra `service_token_would_deny`
//               quando o token não é uma das chaves conhecidas (padrão)
//   "enforce" → só aceita chave conhecida
// Ligar "enforce" depois de um período sem `service_token_would_deny` de
// chamador legítimo. Detalhe: docs/operations/proposals/2026-11-18-token-interno-sem-assinatura.md
// ============================================================================

export type ServiceAuthMode = "log" | "enforce";

export function serviceAuthMode(): ServiceAuthMode {
  return (Deno.env.get("SERVICE_AUTH_STRICT") || "log").toLowerCase().trim() === "enforce" ? "enforce" : "log";
}

/** Comparação em tempo constante. */
export function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Chamada interna de outra função (ex.: o agente de IA): o token é EXATAMENTE a chave da função
 * (SUPABASE_SERVICE_ROLE_KEY). Mais estrito que verifyServiceRoleAuth: sem claims, sem cofre.
 * Usado onde a chamada interna age em nome de um usuário da org (acting_user_id).
 */
export function isFunctionKeyCall(req: Request): boolean {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  return isKnownInternalKey(token, [Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")]);
}

/** O token é exatamente uma das chaves internas? Lista vazia ou só com vazios: ninguém passa. */
export function isKnownInternalKey(token: string, knownKeys: Array<string | null | undefined>): boolean {
  if (!token) return false;
  let ok = false;
  for (const key of knownKeys) {
    // Sem interromper no primeiro acerto, para o tempo não depender de qual chave casou.
    if (typeof key === "string" && key.trim() && sameSecret(token, key.trim())) ok = true;
  }
  return ok;
}

/**
 * Decisão, separada da entrada e saída para ser testável.
 *  - chave conhecida → aceita
 *  - claims inválidas → recusa (como antes)
 *  - claims válidas, mas o token não é chave conhecida (pode ser forjado):
 *      "enforce" recusa; "log" aceita e avisa
 *  - não foi possível ler a chave do cofre: não há como distinguir o job do
 *    pg_cron de um token forjado; aceita pelas claims e avisa, para uma falha do
 *    cofre não parar os jobs
 */
export function decideServiceAuth(
  claims: { ok: boolean; error?: string },
  isKnownKey: boolean,
  mode: ServiceAuthMode,
  vaultAvailable: boolean,
): { ok: boolean; error?: string; warn?: "would_deny" | "vault_unavailable" } {
  if (isKnownKey) return { ok: true };
  if (!claims.ok) return { ok: false, error: claims.error };
  if (!vaultAvailable) return { ok: true, warn: "vault_unavailable" };
  if (mode === "enforce") return { ok: false, error: "Service token is not a known internal key" };
  return { ok: true, warn: "would_deny" };
}

let vaultKeyCache: { value: string | null; available: boolean; at: number } | null = null;
const VAULT_KEY_TTL_MS = 5 * 60_000;
const VAULT_ERROR_TTL_MS = 30_000;

async function vaultInternalKey(): Promise<{ value: string | null; available: boolean }> {
  const now = Date.now();
  if (vaultKeyCache && now - vaultKeyCache.at < (vaultKeyCache.available ? VAULT_KEY_TTL_MS : VAULT_ERROR_TTL_MS)) {
    return vaultKeyCache;
  }
  let value: string | null = null;
  let available = false;
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const { data, error } = await admin.rpc("get_internal_function_auth_token");
    if (!error) {
      available = true;
      value = typeof data === "string" && data ? data : null;
    }
  } catch (_e) {
    available = false;
  }
  vaultKeyCache = { value, available, at: now };
  return vaultKeyCache;
}

/** Substitui `validateServiceRoleAuth` nas funções: mesma resposta, com a chave conferida. */
export async function verifyServiceRoleAuth(req: Request): Promise<{ ok: boolean; error?: string }> {
  const claims = validateServiceRoleAuth(req);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const envKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // A chave da função resolve a maioria das chamadas sem ir ao cofre.
  if (isKnownInternalKey(token, [envKey])) return { ok: true };
  if (!claims.ok) return { ok: false, error: claims.error };

  const vault = await vaultInternalKey();
  const mode = serviceAuthMode();
  const decision = decideServiceAuth(claims, isKnownInternalKey(token, [vault.value]), mode, vault.available);
  if (decision.warn) {
    // Nunca o token: só de onde veio e o que as claims dizem.
    const c = jwtClaims(req);
    console.warn(`[AUTH] service_token_${decision.warn}`, JSON.stringify({
      fn: new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? null,
      mode,
      bearer_role: c.role,
      user_agent: req.headers.get("user-agent") ?? null,
    }));
  }
  return decision.ok ? { ok: true } : { ok: false, error: decision.error };
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
  | { ok: false; error: string; detail?: string };

// Aceita service_role OU JWT de usuário com vínculo ativo na organização.
// Nunca lança: qualquer falha vira { ok: false } para o caller decidir
// (em modo "log" a falha é apenas observada).
export async function validateCallerAuth(
  req: Request,
  organizationId: string,
): Promise<CallerAuth> {
  const result = await checkCallerAuth(req, organizationId);
  if (!result.ok) logAuthRejection(req, organizationId, result.error, result.detail);
  return result.ok ? result : { ok: false, error: result.error };
}

// Recusa de chamador SEMPRE vira log estruturado: sem isso um 401 não deixa rastro
// (incidente 18/11: envio recusado sem saber se foi sessão expirada ou vínculo).
// Nunca loga o token; só claims não sensíveis (sub, role, exp).
function jwtClaims(req: Request): { role: string; sub: string | null; exp: number | null } {
  const raw = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const parts = raw.split(".");
  if (parts.length !== 3) return { role: raw ? "not_jwt" : "none", sub: null, exp: null };
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const p = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    return { role: p.role ?? "unknown", sub: p.sub ?? null, exp: typeof p.exp === "number" ? p.exp : null };
  } catch (_e) {
    return { role: "invalid", sub: null, exp: null };
  }
}

function logAuthRejection(req: Request, organizationId: string, reason: string, detail?: string): void {
  const c = jwtClaims(req);
  const now = Math.floor(Date.now() / 1000);
  console.warn("[AUTH] caller_rejected", JSON.stringify({
    fn: new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? null,
    organization_id: organizationId,
    reason,
    detail: detail ?? null,
    bearer_role: c.role,
    auth_user_id: c.sub,
    token_exp: c.exp ? new Date(c.exp * 1000).toISOString() : null,
    token_expired_seconds_ago: c.exp && c.exp < now ? now - c.exp : null,
    user_agent: req.headers.get("user-agent") ?? null,
  }));
}

async function checkCallerAuth(
  req: Request,
  organizationId: string,
): Promise<CallerAuth> {
  const sr = await verifyServiceRoleAuth(req);
  if (sr.ok) return { ok: true, kind: "service_role" };

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, error: "missing_bearer" };

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return { ok: false, error: "invalid_user_jwt", detail: userErr?.message };

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

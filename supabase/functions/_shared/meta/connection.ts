// Helpers compartilhados da camada Meta Connection (OAuth Login for Business).
// Segurança: nunca logar token/code; App Secret só via env; appsecret_proof no Graph.
import { metaGraphGet, MetaGraphError } from "../meta-graph.ts";
import { decryptSecret } from "../crypto.ts";

// Versão canônica da Graph (fonte de verdade operacional; frontend recebe via build).
export const GRAPH_API_VERSION = Deno.env.get("META_GRAPH_API_VERSION") || "v26.0";
export const SYNC_VERSION = "1";
export const PARSER_VERSION = "1";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export function facebookAppId(): string | undefined {
  return Deno.env.get("FACEBOOK_APP_ID")?.trim() || undefined;
}
export function facebookAppSecret(): string | undefined {
  return Deno.env.get("FACEBOOK_APP_SECRET")?.trim() || undefined;
}
export function facebookConfigured(): boolean {
  return Boolean(facebookAppId() && facebookAppSecret());
}

// Troca do `code` do FB.login (Login for Business, response_type=code) por token.
// Sem redirect_uri no fluxo do JS SDK. code é single-use.
export async function exchangeCodeForToken(
  code: string,
): Promise<{ access_token: string; token_type?: string; expires_in?: number }> {
  const id = facebookAppId();
  const secret = facebookAppSecret();
  if (!id || !secret) throw new Error("facebook_app_not_configured");
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", id);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("code", code);
  const res = await fetch(url.toString(), { method: "GET" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error || !json.access_token) {
    // Não incluir o code na mensagem.
    throw new MetaGraphError(res.status, json.error || { message: "token_exchange_failed" });
  }
  return json;
}

// Introspection oficial do token — sem heurística de tipo (ajuste 4).
export interface TokenDebug {
  token_type: "system_user" | "user" | "unknown";
  scopes: string[];
  granular_scopes: unknown;
  expires_at: string | null;
  data_access_expires_at: string | null;
  app_id?: string;
  meta_user_id?: string;
}
export async function introspectToken(token: string): Promise<TokenDebug> {
  const id = facebookAppId();
  const secret = facebookAppSecret();
  const appToken = `${id}|${secret}`; // app access token para o debug_token
  const res = await metaGraphGet("/debug_token", { input_token: token }, { accessToken: appToken });
  const d = (res?.data ?? {}) as Record<string, any>;
  // Tipo vem SOMENTE do que a Meta retorna. Sem inventar "long_lived".
  const token_type = d.type === "SYSTEM_USER"
    ? "system_user"
    : d.type === "USER"
    ? "user"
    : "unknown";
  const toIso = (n: unknown) =>
    typeof n === "number" && n > 0 ? new Date(n * 1000).toISOString() : null;
  return {
    token_type,
    scopes: Array.isArray(d.scopes) ? d.scopes : [],
    granular_scopes: d.granular_scopes ?? null,
    expires_at: toIso(d.expires_at),          // 0/ausente => null (perene, mas não afirmamos system-user por isso)
    data_access_expires_at: toIso(d.data_access_expires_at),
    app_id: d.app_id ? String(d.app_id) : undefined,
    meta_user_id: d.user_id ? String(d.user_id) : undefined,
  };
}

// ---- Fase 1: resolução de credencial CANÔNICA com dual-read + fallback legado ----
// Consumidores (Lead Generation, CAPI, …) resolvem o token Meta pela Meta Connection
// canônica quando a flag `meta_canonical_credential` está ligada p/ a org E existe uma
// conexão `connected`; senão caem no token legado (fallback preservado). Sem token/
// ciphertext no frontend (isto roda só com service_role). O caminho escolhido é logado
// com a tag [meta-token] source=canonical|legacy — trilha de auditoria nos edge logs.
export interface ResolvedMetaToken {
  token: string;
  appSecret?: string;
  source: "canonical" | "legacy";
  connection_id?: string;
}
export async function resolveOrgMetaToken(
  admin: any,
  orgId: string,
  legacyToken: () => Promise<{ token: string; appSecret?: string } | null>,
  ctx?: { capability?: string },
): Promise<ResolvedMetaToken | null> {
  const cap = ctx?.capability ?? "meta";
  let canonicalOn = false;
  try {
    const { data } = await admin.rpc("fn_feature_flag_enabled", {
      _flag_key: "meta_canonical_credential",
      _organization_id: orgId,
    });
    canonicalOn = data === true;
  } catch (_) { canonicalOn = false; }

  if (canonicalOn) {
    const { data: conn } = await admin
      .from("meta_connections")
      .select("id")
      .eq("organization_id", orgId)
      .eq("status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (conn?.id) {
      try {
        const token = await resolveConnectionToken(admin, conn.id);
        console.log(`[meta-token] cap=${cap} org=${orgId} source=canonical connection=${conn.id} result=ok`);
        return { token, appSecret: facebookAppSecret(), source: "canonical", connection_id: conn.id };
      } catch (e) {
        console.warn(`[meta-token] cap=${cap} org=${orgId} source=canonical result=fail reason=${(e as Error).message} fallback=legacy`);
      }
    } else {
      console.log(`[meta-token] cap=${cap} org=${orgId} source=canonical result=no_connection fallback=legacy`);
    }
  }

  const legacy = await legacyToken();
  if (legacy?.token) {
    console.log(`[meta-token] cap=${cap} org=${orgId} source=legacy result=ok`);
    return { token: legacy.token, appSecret: legacy.appSecret, source: "legacy" };
  }
  console.warn(`[meta-token] cap=${cap} org=${orgId} result=fail reason=no_token_any_source`);
  return null;
}

// Resolve e descriptografa o token de uma conexão. SÓ backend/service_role.
export async function resolveConnectionToken(
  admin: any,
  connectionId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("meta_connection_credentials")
    .select("token_encrypted")
    .eq("connection_id", connectionId)
    .maybeSingle();
  if (error || !data?.token_encrypted) throw new Error("connection_credentials_missing");
  return await decryptSecret(data.token_encrypted);
}

// Classificação de erro do Graph p/ backoff e persistência.
export type ErrorClass = "auth" | "rate_limit" | "transient" | "permanent";
export function classifyMetaError(err: unknown): ErrorClass {
  if (err instanceof MetaGraphError) {
    const code = err.error.code ?? 0;
    if ([190, 102, 463, 467, 460].includes(code)) return "auth";
    // 4/17/32/613 = limites de aplicação/usuário/ad-account; 429 = rate limit HTTP.
    if ([4, 17, 32, 613, 80000, 80003, 80004].includes(code) || err.status === 429) return "rate_limit";
    if (err.status >= 500 || err.status === 0) return "transient";
    return "permanent";
  }
  return "transient";
}

// Retry com backoff exponencial + jitter; não repete auth/permanent.
export async function withRetry<T>(fn: () => Promise<T>, opts: { max?: number } = {}): Promise<T> {
  const max = opts.max ?? 5;
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      const cls = classifyMetaError(err);
      if (cls === "auth" || cls === "permanent" || attempt >= max) throw err;
      const base = cls === "rate_limit" ? 5_000 : 500;
      const delay = Math.min(base * 2 ** (attempt - 1), 60_000) + Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// Paginação de uma edge do Graph (segue paging.next). Aplica withRetry por página.
export async function graphPaginate(
  path: string,
  params: Record<string, string | number | undefined>,
  accessToken: string,
  appSecret: string | undefined,
  opts: { maxPages?: number } = {},
): Promise<any[]> {
  const out: any[] = [];
  const maxPages = opts.maxPages ?? 200;
  let page = await withRetry(() => metaGraphGet(path, { ...params }, { accessToken, appSecret }));
  let count = 0;
  while (page) {
    if (Array.isArray(page.data)) out.push(...page.data);
    const next = page?.paging?.next as string | undefined;
    if (!next || ++count >= maxPages) break;
    // paging.next é URL completa; refazemos via fetch direto (mantém withRetry).
    page = await withRetry(async () => {
      const res = await fetch(next, { method: "GET" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new MetaGraphError(res.status, json.error || { message: `HTTP ${res.status}` });
      return json;
    });
  }
  return out;
}

// Audit best-effort (nunca derruba o fluxo).
export async function audit(
  admin: any,
  row: {
    organization_id: string;
    connection_id?: string | null;
    actor_user_id?: string | null;
    action: "connect" | "reconnect" | "disconnect" | "select_assets" | "token_refresh" | "data_deletion";
    detail?: unknown;
  },
): Promise<void> {
  await admin
    .from("meta_connection_audit")
    .insert({
      organization_id: row.organization_id,
      connection_id: row.connection_id ?? null,
      actor_user_id: row.actor_user_id ?? null,
      action: row.action,
      detail: row.detail ?? {},
    })
    .then(() => {}, () => {});
}

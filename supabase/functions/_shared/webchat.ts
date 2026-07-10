// Helpers compartilhados das edge functions do webchat (v1).
// Widget = communication_endpoint (channel='webchat'); a chave pública do
// snippet é external_account_id = 'wgt_<key>'. Toda a config vive em
// inbound_settings (jsonb). Nenhum acesso anon ao banco: as edge functions
// usam service_role e validam token/origem por conta própria.

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// CORS: o fetch parte do NOSSO iframe (widget host), sem cookies/credenciais,
// então '*' é seguro. A validação anti-abuso da landing page é separada
// (checkAllowedOrigin sobre o parent_origin reportado pelo loader).
export const webchatCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webchat-key, x-webchat-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...webchatCors, "Content-Type": "application/json" },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: webchatCors });
  return null;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Token de sessão opaco entregue ao visitante (guardado no localStorage do widget).
// Só o hash sha256 é persistido em webchat_sessions.token_hash.
export function newSessionToken(): string {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  return "wcs_" + Array.from(raw).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface WebchatEndpoint {
  id: string;
  organization_id: string;
  display_name: string | null;
  purpose: string;
  is_active: boolean;
  status: string;
  inbound_settings: Record<string, any>;
}

// Resolve o widget pela chave pública (external_account_id).
export async function resolveWidget(
  sb: SupabaseClient,
  widgetKey: string | null,
): Promise<WebchatEndpoint | null> {
  if (!widgetKey || !widgetKey.startsWith("wgt_")) return null;
  const { data } = await sb
    .from("communication_endpoints")
    .select("id, organization_id, display_name, purpose, is_active, status, inbound_settings")
    .eq("channel", "webchat")
    .eq("external_account_id", widgetKey)
    .maybeSingle();
  if (!data || data.is_active === false) return null;
  return { ...data, inbound_settings: (data as any).inbound_settings ?? {} } as WebchatEndpoint;
}

// Anti-abuso soft: a origem da landing page é reportada pelo loader (parent_origin).
// Não é barreira dura (a chave é pública) — mismatch é sinal, tratado conforme o
// modo (log/enforce) pelo caller.
export function checkAllowedOrigin(parentOrigin: string | null, settings: Record<string, any>): boolean {
  const allowed: string[] = Array.isArray(settings?.allowed_domains) ? settings.allowed_domains : [];
  if (allowed.length === 0) return true; // sem allowlist configurada => não bloqueia
  if (!parentOrigin) return false;
  let host = parentOrigin;
  try { host = new URL(parentOrigin).host; } catch { /* parentOrigin pode já vir como host */ }
  host = host.replace(/^www\./, "").toLowerCase();
  return allowed.some((d) => {
    const norm = String(d).replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();
    return host === norm || host.endsWith("." + norm);
  });
}

// EDGE_AUTH_ENFORCE: off | log (default) | enforce — mesmo padrão de _shared/auth.ts.
export function edgeAuthMode(): "off" | "log" | "enforce" {
  const v = (Deno.env.get("EDGE_AUTH_ENFORCE") || "log").toLowerCase().trim();
  if (v === "off" || v === "enforce") return v;
  return "log";
}

// Registra o payload bruto em integration_inbound_events (fonte de verdade,
// padrão da casa). Falha nunca quebra o fluxo. Idempotência por chave.
export async function logInbound(
  sb: SupabaseClient,
  opts: {
    organization_id: string | null;
    source_event: string;
    external_id: string | null;
    idempotency_key: string;
    raw_payload: unknown;
    raw_headers?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { error } = await sb.from("integration_inbound_events").insert({
      organization_id: opts.organization_id,
      integration_slug: "webchat",
      source_event: opts.source_event,
      external_id: opts.external_id,
      idempotency_key: opts.idempotency_key,
      raw_payload: opts.raw_payload,
      raw_headers: opts.raw_headers ?? {},
      http_method: "POST",
      request_path: "/functions/v1/webchat-message",
      parser_function: "webchat",
    });
    // 23505 = duplicado (mesma idempotency_key) => ok, já registrado
    if (error && (error as any).code !== "23505") {
      console.error("[webchat] inbound log failed:", error.message);
    }
  } catch (e) {
    console.error("[webchat] inbound log exception:", (e as Error)?.message);
  }
}

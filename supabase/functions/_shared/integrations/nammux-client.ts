// Chamada assinada do Seialz a uma edge function do Nammux (consulta na hora,
// fora da fila). Mesmo segredo, mesmos cabeçalhos e mesma assinatura dos
// eventos enviados pelo integration-worker.
import { loadActiveIntegrationSecret } from "../integration-credentials.ts";
import { allowedNammuxWebhook, hmacSha256Hex, loadNammuxConfig } from "../integration-handlers/nammux.ts";

/**
 * URL de outra função no mesmo projeto do Nammux, a partir da URL do webhook
 * configurada (…/functions/v1/seialz-webhook-ingest). Só host da lista permitida.
 */
export function nammuxFunctionUrl(webhookUrl: string, functionName: string): URL | null {
  if (!/^[a-z0-9-]+$/.test(functionName)) return null;
  const base = allowedNammuxWebhook((webhookUrl ?? "").trim());
  if (!base) return null;
  const marker = "/functions/v1/";
  const at = base.pathname.indexOf(marker);
  if (at < 0) return null;
  const url = new URL(base.toString());
  url.pathname = base.pathname.slice(0, at + marker.length) + functionName;
  url.search = "";
  url.hash = "";
  return url;
}

export type NammuxCallResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; reason: "not_configured" | "http_error" | "network_error"; status?: number };

// deno-lint-ignore no-explicit-any
export async function nammuxSignedPost(supabase: any, organizationId: string, functionName: string, body: Record<string, unknown>): Promise<NammuxCallResult> {
  const cfg = await loadNammuxConfig(supabase, organizationId);
  const targetOrg = (cfg?.nammux_organization_id ?? "").trim();
  const url = cfg && cfg.enabled !== false ? nammuxFunctionUrl(cfg.webhook_url ?? "", functionName) : null;
  let credential: { keyId: string; secret: string } | null = null;
  try {
    credential = await loadActiveIntegrationSecret(supabase, organizationId);
  } catch {
    credential = null;
  }
  if (!url || !credential || !targetOrg) return { ok: false, reason: "not_configured" };

  const rawBody = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await hmacSha256Hex(credential.secret, `${timestamp}.${rawBody}`);
  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Seialz-Signature": `sha256=${signature}`,
        "X-Seialz-Key-Id": credential.keyId,
        "X-Seialz-Timestamp": timestamp,
        "X-Seialz-Organization-Id": organizationId,
        "X-Seialz-Target-Organization-Id": targetOrg,
        "User-Agent": "Seialz-Agent/1.0",
      },
      body: rawBody,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, reason: "http_error", status: res.status };
    const data = await res.json().catch(() => null);
    return data && typeof data === "object"
      ? { ok: true, data: data as Record<string, unknown> }
      : { ok: false, reason: "http_error", status: res.status };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

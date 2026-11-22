// E-mail pela conta Resend da própria organização (cada org conecta a sua chave).
// - renderEmail: corpo do modelo (texto simples com marcadores) dentro da moldura da marca da org,
//   com rodapé e link de descadastro em todo e-mail de marketing.
// - resendRequest: chamada à API da Resend.
// - verifySvixSignature: confere a assinatura dos avisos de retorno (Resend assina pelo Svix).
import type { CadenceVariableContext } from "./cadence-variables.ts";
import { resolveCadenceVariables } from "./cadence-variables.ts";

export const RESEND_API = "https://api.resend.com";

export interface EmailBranding {
  from_name?: string | null;
  brand_color?: string | null;
  logo_url?: string | null;
  footer_text?: string | null;
  org_name?: string | null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Preenche os marcadores de um texto livre. Devolve os marcadores que ficaram vazios. */
export function fillText(text: string, ctx: CadenceVariableContext): { text: string; missing: string[] } {
  const missing: string[] = [];
  const out = text.replace(/\{\{\s*([a-z_]+(?:\.[a-z0-9_]+)+)\s*\}\}/gi, (m, path: string) => {
    const r = resolveCadenceVariables({ v: `{{${path}}}` }, ctx);
    if (r.ok) return r.values.v;
    missing.push(path);
    return "";
  });
  return { text: out, missing: [...new Set(missing)] };
}

/** Texto do modelo → HTML: parágrafos por linha em branco, quebras de linha e links clicáveis. */
export function bodyToHtml(body: string): string {
  return body.trim().split(/\n{2,}/).map((p) => {
    const html = esc(p).replace(/\n/g, "<br>")
      .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" style="color:inherit">$1</a>');
    return `<p style="margin:0 0 16px 0">${html}</p>`;
  }).join("");
}

export function renderEmail(opts: {
  body: string;
  branding: EmailBranding;
  unsubscribeUrl: string | null;
}): { html: string; text: string } {
  const color = /^#[0-9a-f]{6}$/i.test(opts.branding.brand_color ?? "") ? opts.branding.brand_color! : "#111827";
  const logo = opts.branding.logo_url && /^https:\/\//.test(opts.branding.logo_url)
    ? `<img src="${esc(opts.branding.logo_url)}" alt="${esc(opts.branding.org_name ?? "")}" style="max-height:48px;max-width:200px;display:block">`
    : `<div style="font-size:18px;font-weight:600;color:${color}">${esc(opts.branding.org_name ?? opts.branding.from_name ?? "")}</div>`;
  const footer = [
    opts.branding.footer_text ? esc(opts.branding.footer_text).replace(/\n/g, "<br>") : "",
    opts.unsubscribeUrl ? `<a href="${esc(opts.unsubscribeUrl)}" style="color:#6b7280">Não quero mais receber estes e-mails</a>` : "",
  ].filter(Boolean).join("<br><br>");
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;border-top:4px solid ${color}">
<tr><td style="padding:24px 28px 8px 28px">${logo}</td></tr>
<tr><td style="padding:16px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111827">${bodyToHtml(opts.body)}</td></tr>
${footer ? `<tr><td style="padding:16px 28px 24px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;border-top:1px solid #e5e7eb">${footer}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
  const text = [opts.body.trim(), opts.branding.footer_text ?? "", opts.unsubscribeUrl ? `Para não receber mais: ${opts.unsubscribeUrl}` : ""]
    .filter(Boolean).join("\n\n");
  return { html, text };
}

export async function resendRequest(apiKey: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${RESEND_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: data as Record<string, any> };
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * Assinatura Svix: HMAC-SHA256(segredo, `${id}.${timestamp}.${corpo}`) em base64, comparado com cada
 * "v1,<assinatura>" do cabeçalho. Segredo "whsec_<base64>". Recusa aviso com mais de 5 minutos.
 */
export async function verifySvixSignature(opts: {
  secret: string; id: string | null; timestamp: string | null; signature: string | null; body: string; nowSeconds?: number;
}): Promise<boolean> {
  if (!opts.id || !opts.timestamp || !opts.signature || !opts.secret) return false;
  const ts = Number(opts.timestamp);
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return false;
  const key = await crypto.subtle.importKey("raw", b64ToBytes(opts.secret.replace(/^whsec_/, "")),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${opts.id}.${opts.timestamp}.${opts.body}`)));
  const expected = bytesToB64(mac);
  return opts.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig || sig.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

/** Endereço válido o bastante para mandar (o provedor confere de verdade). */
export const looksLikeEmail = (s: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(s.trim());

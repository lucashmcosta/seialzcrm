// Validação de assinatura X-Twilio-Signature (HMAC-SHA1 sobre URL + params
// ordenados, chave = Auth Token). Mesmo algoritmo já usado inline pelo
// twilio-whatsapp-webhook (PR 1.1) — extraído para reutilização no
// twilio-webhook (voz). O webhook de WhatsApp segue com a cópia inline até
// um refactor dedicado, para não mexer no caminho mais quente de produção.
//
// Tolerância a proxy: a URL que o Twilio assinou pode diferir da URL
// interna vista pela function; testamos candidates (env canônica,
// x-forwarded-host, host interno) como no webhook de WhatsApp.
//
// Plano: docs/operations/proposals/2026-07-05-edge-auth-hardening.md

export interface TwilioSignatureResult {
  checked: boolean;   // false = não foi possível validar (sem assinatura/token)
  valid: boolean;
  matched: string;    // label do candidate que bateu, ou "none"
  reason?: string;    // preenchido quando checked=false ou valid=false
  candidateCount: number;
}

export async function validateTwilioRequestSignature(opts: {
  req: Request;
  params: Record<string, string>;
  authToken: string | undefined | null;
  publicBaseEnvVar?: string; // default TWILIO_WEBHOOK_PUBLIC_BASE_URL
}): Promise<TwilioSignatureResult> {
  const { req, params, authToken } = opts;
  const signature = req.headers.get("x-twilio-signature") || req.headers.get("X-Twilio-Signature");

  if (!signature) {
    return { checked: false, valid: false, matched: "none", reason: "missing_signature", candidateCount: 0 };
  }
  if (!authToken) {
    return { checked: false, valid: false, matched: "none", reason: "no_auth_token_resolved", candidateCount: 0 };
  }

  const parsed = new URL(req.url);
  const search = parsed.search || "";
  const pathPart = parsed.pathname.startsWith("/functions/v1/")
    ? parsed.pathname
    : "/functions/v1" + parsed.pathname;

  const candidates: { label: string; url: string }[] = [];
  let publicBase = (Deno.env.get(opts.publicBaseEnvVar || "TWILIO_WEBHOOK_PUBLIC_BASE_URL") || "").trim();
  while (publicBase.endsWith("/")) publicBase = publicBase.slice(0, -1);
  if (publicBase) {
    const lastSegment = parsed.pathname.split("/").pop() || "";
    candidates.push({ label: "canonical_env", url: publicBase + "/" + lastSegment + search });
  }
  const fwdHost = (req.headers.get("x-forwarded-host") || "").split(",")[0].trim();
  const fwdProto = (req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  if (fwdHost) {
    candidates.push({ label: "forwarded_headers", url: fwdProto + "://" + fwdHost + pathPart + search });
  }
  const internalHost = (req.headers.get("host") || parsed.host).split(",")[0].trim();
  candidates.push({ label: "fallback_internal", url: (fwdProto || "https") + "://" + internalHost + pathPart + search });

  const sortedKeys = Object.keys(params).sort();
  const paramsConcat = sortedKeys.map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  for (const c of candidates) {
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(c.url + paramsConcat));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
    if (b64 === signature) {
      return { checked: true, valid: true, matched: c.label, candidateCount: candidates.length };
    }
  }

  return { checked: true, valid: false, matched: "none", reason: "no_candidate_matched", candidateCount: candidates.length };
}

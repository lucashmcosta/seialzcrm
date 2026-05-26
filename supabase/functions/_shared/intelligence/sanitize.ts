// Sanitize provider errors and log payloads.
// Never log api keys, ciphertext, full bodies.

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /sk_live_[A-Za-z0-9]{16,}/g,
  /xoxb-[A-Za-z0-9-]{16,}/g,
  /Bearer\s+[A-Za-z0-9._-]{20,}/gi,
  /v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+/g, // our AES-GCM ciphertext format
];

export function redact(input: unknown): unknown {
  if (input == null) return input;
  if (typeof input === "string") {
    let out = input;
    for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
    return out;
  }
  if (Array.isArray(input)) return input.map(redact);
  if (typeof input === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (/api[_-]?key|secret|token|password|ciphertext|encrypted/i.test(k)) {
        o[k] = "[REDACTED]";
      } else {
        o[k] = redact(v);
      }
    }
    return o;
  }
  return input;
}

export function safeLog(label: string, payload?: unknown) {
  if (payload === undefined) console.log(label);
  else console.log(label, JSON.stringify(redact(payload)));
}

export type ProviderErrorKind =
  | "invalid_key"
  | "rate_limit"
  | "budget"
  | "transient"
  | "bad_request"
  | "unknown";

export interface SanitizedProviderError {
  kind: ProviderErrorKind;
  status: number;
  code?: string;
  message: string; // safe, generic
}

export function classifyHttpStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 429) return "rate_limit";
  if (status === 402) return "budget";
  if (status >= 500) return "transient";
  if (status >= 400) return "bad_request";
  return "unknown";
}

const GENERIC_MESSAGES: Record<ProviderErrorKind, string> = {
  invalid_key: "Provider rejected the credentials.",
  rate_limit: "Provider rate limit reached.",
  budget: "Provider reported a payment/quota issue.",
  transient: "Provider had a transient failure.",
  bad_request: "Provider rejected the request payload.",
  unknown: "Provider returned an unexpected error.",
};

export function sanitizeProviderError(
  status: number,
  rawBody?: unknown,
): SanitizedProviderError {
  const kind = classifyHttpStatus(status);
  let code: string | undefined;
  try {
    const b = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
    const c = (b as any)?.error?.code ?? (b as any)?.error?.type ?? (b as any)?.code;
    if (typeof c === "string" && c.length < 64) code = c;
  } catch { /* ignore */ }
  return { kind, status, code, message: GENERIC_MESSAGES[kind] };
}

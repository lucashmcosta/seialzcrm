// Evolution API — Logger estruturado com redação obrigatória.
// Nunca serializar: apikey, token, hash, base64 do QR, Authorization,
// x-discovery-token, code (WA link code).

const REDACTED_KEYS = new Set([
  "apikey",
  "api_key",
  "apiKey",
  "token",
  "hash",
  "base64",
  "authorization",
  "Authorization",
  "x-discovery-token",
  "x-api-key",
  "code", // WA link code do QR — string sensível
  "pairingCode",
]);

function redactValue(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined) return v;
  if (depth > 6) return "[max-depth]";
  if (typeof v === "string") {
    // Data URLs de imagem (base64 do QR) — nunca logar bytes
    if (v.startsWith("data:image/") && v.includes(";base64,")) {
      return "***REDACTED_BASE64***";
    }
    return v.length > 500 ? v.slice(0, 500) + "…[truncated]" : v;
  }
  if (Array.isArray(v)) return v.map((x) => redactValue(x, depth + 1));
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(k)) {
        out[k] = "***REDACTED***";
      } else {
        out[k] = redactValue(val, depth + 1);
      }
    }
    return out;
  }
  return v;
}

export interface EvolutionLogFields {
  fn: "evolution-instance-manager" | "evolution-webhook";
  op?: string;
  requestId?: string;
  instanceName?: string;
  orgId?: string | null;
  event?: string;
  status?: number;
  durationMs?: number;
  code?: string;
  message?: string;
  // qualquer contexto adicional será redigido
  ctx?: Record<string, unknown>;
}

export function logEvolution(
  level: "info" | "warn" | "error",
  fields: EvolutionLogFields,
): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    ...fields,
    ctx: fields.ctx ? redactValue(fields.ctx) : undefined,
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

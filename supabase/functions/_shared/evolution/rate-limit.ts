// In-memory token bucket rate limiter per Edge Function isolate.
// Fase 4 — proteção contra abuso. Não usa Redis nem tabela.
//
// NOTA: por ser in-memory por isolate, o limite é aproximado sob carga
// distribuída (múltiplos isolates da mesma função). É suficiente como
// proteção de primeiro nível contra floods triviais sem alterar o
// comportamento funcional do sistema.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function gc(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

/**
 * Fixed-window rate limit. Retorna allowed=false quando o `key` estoura o
 * limite dentro da janela `windowMs`. Não lança.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  gc(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt, retryAfterSec: 0 };
  }
  if (b.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: b.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    };
  }
  b.count += 1;
  return {
    allowed: true,
    remaining: limit - b.count,
    resetAt: b.resetAt,
    retryAfterSec: 0,
  };
}

/**
 * Extrai um identificador estável do caller para chavear o rate limit.
 * Preferimos x-forwarded-for; caímos para cf-connecting-ip; em último caso
 * usamos o próprio user-agent (best-effort, nunca vazio).
 */
export function callerKey(req: Request, prefix: string): string {
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "anon";
  return `${prefix}:${ip}`;
}

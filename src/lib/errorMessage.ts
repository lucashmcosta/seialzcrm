/**
 * Normalize any thrown error / rejected value into a safe string
 * for use as toast description, React children, or persisted state.
 *
 * Guards against objects like `{code, message}` (Meta / Supabase FunctionsHttpError)
 * being rendered directly, which crashes React with
 * "Objects are not valid as a React child".
 */
export function toErrorMessageString(err: unknown, fallback = 'Erro desconhecido'): string {
  if (err == null) return fallback;
  if (typeof err === 'string') return err;
  if (typeof err === 'number' || typeof err === 'boolean') return String(err);

  if (typeof err === 'object') {
    const e = err as Record<string, any>;

    // Common shapes: {message: string}, {message: {message: string}}, {error: string}
    const candidates = [e.message, e.error, e.details, e.reason];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c;
      if (c && typeof c === 'object') {
        const inner = (c as any).message ?? (c as any).error;
        if (typeof inner === 'string' && inner.trim()) return inner;
      }
    }

    try {
      const s = JSON.stringify(err);
      if (s && s !== '{}') return s.length > 500 ? s.slice(0, 500) + '…' : s;
    } catch {
      /* noop */
    }
  }

  return fallback;
}

import { FunctionsHttpError } from '@supabase/supabase-js';

/** Mensagem que a Edge Function devolveu, em vez do genérico "non-2xx status code". */
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.clone().json();
      if (typeof payload?.error === 'string' && payload.error) return payload.error;
    } catch { /* corpo sem JSON */ }
  }
  return fallback;
}

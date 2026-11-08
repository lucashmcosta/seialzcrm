// Regras puras de contato (sem Supabase), testáveis com Deno.
// Usadas pela tela de edição (ContactForm) e pela Ficha lateral do Comercial.
import { digits, isValidCpf } from './regional.ts';

/** Mensagem de erro (pt-BR) para um CPF digitado, ou null se vazio/válido. */
export function cpfInputError(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const d = digits(cpf);
  if (d.length !== 11) return 'O CPF deve ter exatamente 11 dígitos.';
  if (!isValidCpf(d)) return 'CPF inválido. Confira os dígitos informados.';
  return null;
}

export type ContactDbErrorKind =
  | { kind: 'duplicate_cpf'; contactId: string }
  | { kind: 'duplicate_phone' }
  | { kind: 'duplicate_email' }
  | { kind: 'other'; message?: string };

/** Traduz o erro do Postgres (unique violation 23505 + trigger duplicate_cpf). */
export function classifyContactDbError(error: unknown): ContactDbErrorKind {
  const dbError = (error ?? {}) as { code?: string; message?: string };
  if (dbError.code === '23505') {
    const msg = String(dbError.message || '');
    const duplicateCpfId = msg.match(/duplicate_cpf:([0-9a-f-]{36})/i)?.[1];
    if (duplicateCpfId) return { kind: 'duplicate_cpf', contactId: duplicateCpfId };
    if (msg.includes('phone_normalized') || msg.includes('phone')) return { kind: 'duplicate_phone' };
    if (msg.includes('email')) return { kind: 'duplicate_email' };
  }
  return { kind: 'other', message: dbError.message };
}


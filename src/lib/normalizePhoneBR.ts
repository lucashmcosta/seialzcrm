/**
 * Porta em TS a função public.normalize_phone_br do banco.
 * Necessário pra checagem de duplicidade encontrar contatos
 * salvos com/sem o 9º dígito (formato antigo).
 */
export function normalizePhoneBR(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length < 10) return digits || null;

  let local: string;
  if (digits.startsWith('55') && digits.length >= 12) {
    local = digits.substring(2);
  } else {
    return digits;
  }

  if (local.length !== 10 && local.length !== 11) return digits;

  const ddd = local.substring(0, 2);
  const rest = local.substring(2);

  if (local.length === 11 && rest.charAt(0) === '9') {
    return '55' + local;
  }
  if (local.length === 10) {
    return '55' + ddd + '9' + rest;
  }
  return '55' + local;
}

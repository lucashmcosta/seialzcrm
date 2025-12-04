/**
 * Utilitário para formatação de números de telefone brasileiros
 */

/**
 * Formata número para exibição no padrão brasileiro
 * Celular: (11) 96429-8621
 * Fixo: (11) 6429-8621
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  
  // Remove tudo que não é número
  const cleaned = phone.replace(/\D/g, '');
  
  // Remove código do país se tiver
  let number = cleaned;
  if (number.startsWith('55') && number.length > 11) {
    number = number.substring(2);
  }
  
  // 11 dígitos = celular com 9 (DDD + 9 + 8 dígitos)
  if (number.length === 11) {
    return `(${number.slice(0, 2)}) ${number.slice(2, 7)}-${number.slice(7)}`;
  }
  
  // 10 dígitos = fixo (DDD + 8 dígitos)
  if (number.length === 10) {
    return `(${number.slice(0, 2)}) ${number.slice(2, 6)}-${number.slice(6)}`;
  }
  
  // 9 dígitos = celular sem DDD (9 + 8 dígitos)
  if (number.length === 9) {
    return `${number.slice(0, 5)}-${number.slice(5)}`;
  }
  
  // 8 dígitos = fixo sem DDD
  if (number.length === 8) {
    return `${number.slice(0, 4)}-${number.slice(4)}`;
  }
  
  // Fallback: retorna original
  return phone;
}

/**
 * Formata número para E.164 (padrão internacional do Twilio)
 * Entrada: 11964298621 → Saída: +5511964298621
 * Entrada: (11) 96429-8621 → Saída: +5511964298621
 */
export function formatPhoneE164(phone: string | null | undefined): string {
  if (!phone) return '';
  
  // Remove tudo que não é número ou +
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // Se já começa com +, assume que está formatado
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  
  // Se começa com 55 e tem 12-13 dígitos, adiciona só o +
  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    return '+' + cleaned;
  }
  
  // Números brasileiros (10-11 dígitos: DDD + número)
  // 10 dígitos = fixo, 11 dígitos = celular com 9
  if (cleaned.length >= 10 && cleaned.length <= 11) {
    return '+55' + cleaned;
  }
  
  // Fallback: adiciona +55 mesmo assim
  return '+55' + cleaned;
}

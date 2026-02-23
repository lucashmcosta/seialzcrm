/**
 * Utilitário para formatação de números de telefone com suporte a múltiplos países
 */

export interface Country {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  placeholder: string;
}

export const COUNTRIES: Country[] = [
  { code: 'BR', name: 'Brasil', dialCode: '55', flag: '🇧🇷', placeholder: '(11) 96429-8621' },
  { code: 'US', name: 'EUA', dialCode: '1', flag: '🇺🇸', placeholder: '(555) 123-4567' },
  { code: 'PT', name: 'Portugal', dialCode: '351', flag: '🇵🇹', placeholder: '912 345 678' },
  { code: 'AR', name: 'Argentina', dialCode: '54', flag: '🇦🇷', placeholder: '11 1234-5678' },
  { code: 'CL', name: 'Chile', dialCode: '56', flag: '🇨🇱', placeholder: '9 1234 5678' },
  { code: 'MX', name: 'México', dialCode: '52', flag: '🇲🇽', placeholder: '55 1234 5678' },
  { code: 'AU', name: 'Australia', dialCode: '61', flag: '🇦🇺', placeholder: '412 345 678' },
];

/**
 * Detecta o país a partir de um número E.164
 */
export function detectCountryFromE164(phone: string): string {
  if (!phone) return 'BR';
  
  const cleaned = phone.replace(/\D/g, '');
  
  // Check each country's dial code (longer codes first to avoid false matches)
  const sortedCountries = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
  
  for (const country of sortedCountries) {
    if (cleaned.startsWith(country.dialCode)) {
      return country.code;
    }
  }
  
  return 'BR'; // Default
}

/**
 * Formata número para exibição baseado no país
 */
export function formatPhoneForCountry(phone: string, countryCode: string): string {
  if (!phone) return '';
  
  // Remove tudo que não é número
  let cleaned = phone.replace(/\D/g, '');
  
  const country = COUNTRIES.find(c => c.code === countryCode);
  if (!country) return phone;
  
  // Remove o código do país se presente
  if (cleaned.startsWith(country.dialCode)) {
    cleaned = cleaned.substring(country.dialCode.length);
  }
  
  // Formata baseado no país
  switch (countryCode) {
    case 'BR':
      // 11 dígitos = celular com 9 (DDD + 9 + 8 dígitos)
      if (cleaned.length === 11) {
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
      }
      // 10 dígitos = fixo (DDD + 8 dígitos)
      if (cleaned.length === 10) {
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
      }
      // 9 dígitos = celular sem DDD
      if (cleaned.length === 9) {
        return `${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
      }
      // 8 dígitos = fixo sem DDD
      if (cleaned.length === 8) {
        return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
      }
      break;
      
    case 'US':
      // 10 dígitos = (555) 123-4567
      if (cleaned.length === 10) {
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
      }
      break;
      
    case 'PT':
      // 9 dígitos = 912 345 678
      if (cleaned.length === 9) {
        return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
      }
      break;
      
    case 'AR':
      // 10 dígitos = 11 1234-5678
      if (cleaned.length === 10) {
        return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
      }
      break;
      
    case 'CL':
      // 9 dígitos = 9 1234 5678
      if (cleaned.length === 9) {
        return `${cleaned.slice(0, 1)} ${cleaned.slice(1, 5)} ${cleaned.slice(5)}`;
      }
      break;
      
    case 'MX':
      // 10 dígitos = 55 1234 5678
      if (cleaned.length === 10) {
        return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 6)} ${cleaned.slice(6)}`;
      }
      break;
      
    case 'AU':
      // 9 dígitos = 412 345 678
      if (cleaned.length === 9) {
        return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
      }
      break;
  }
  
  return cleaned;
}

/**
 * Constrói número E.164 a partir de número local + código do país
 */
export function buildE164(localNumber: string, countryCode: string): string {
  if (!localNumber) return '';
  
  const cleaned = localNumber.replace(/\D/g, '');
  if (!cleaned) return '';
  
  const country = COUNTRIES.find(c => c.code === countryCode);
  if (!country) return `+55${cleaned}`;
  
  // Se já começa com o código do país, não duplica
  if (cleaned.startsWith(country.dialCode)) {
    return `+${cleaned}`;
  }
  
  return `+${country.dialCode}${cleaned}`;
}

/**
 * Formata número para exibição no padrão brasileiro (legacy - mantido para compatibilidade)
 * Celular: (11) 96429-8621
 * Fixo: (11) 6429-8621
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  return formatPhoneForCountry(phone, detectCountryFromE164(phone));
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
  
  // Detecta o país e constrói E.164
  const country = detectCountryFromE164(cleaned);
  return buildE164(cleaned, country);
}

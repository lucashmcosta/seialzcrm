export type OperatingCountryCode = 'BR' | 'US';
export type CpfVerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'invalid'
  | 'error';

export function digits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function normalizeCnpj(value: string | null | undefined): string {
  return String(value ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

export function isValidCnpj(value: string | null | undefined): boolean {
  const cnpj = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^([A-Z0-9])\1{13}$/.test(cnpj)) return false;

  const calculate = (baseLength: 12 | 13) => {
    const weights = baseLength === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce(
      (total, weight, index) => total + (cnpj.charCodeAt(index) - 48) * weight,
      0,
    );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculate(12) === Number(cnpj[12]) && calculate(13) === Number(cnpj[13]);
}

export function isValidCpf(value: string | null | undefined): boolean {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculate = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculate(9) === Number(cpf[9]) && calculate(10) === Number(cpf[10]);
}

export function canonicalContactName(
  country: OperatingCountryCode,
  values: { fullName?: string; firstName?: string; lastName?: string },
): { fullName: string; firstName: string | null; lastName: string | null } {
  const clean = (value?: string) => String(value ?? '').trim().replace(/\s+/g, ' ');
  const firstName = clean(values.firstName);
  const lastName = clean(values.lastName);
  if (country === 'US') {
    return {
      fullName: [firstName, lastName].filter(Boolean).join(' '),
      firstName: firstName || null,
      lastName: lastName || null,
    };
  }
  return {
    fullName: clean(values.fullName),
    firstName: firstName || null,
    lastName: lastName || null,
  };
}

export const cpfStatusLabel: Record<CpfVerificationStatus, string> = {
  unverified: 'Não verificado',
  pending: 'Verificação pendente',
  verified: 'Verificado',
  invalid: 'CPF inválido',
  error: 'Falha na verificação',
};

const cpfStatusLabelEn: Record<CpfVerificationStatus, string> = {
  unverified: 'Not verified',
  pending: 'Verification pending',
  verified: 'Verified',
  invalid: 'Invalid CPF',
  error: 'Verification failed',
};

export function cpfStatusLabelFor(
  status: CpfVerificationStatus,
  locale: string,
): string {
  return locale === 'en-US' ? cpfStatusLabelEn[status] : cpfStatusLabel[status];
}

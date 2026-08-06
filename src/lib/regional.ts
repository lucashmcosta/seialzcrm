export type OperatingCountryCode = "BR" | "US";
export type ContactSex = "female" | "male" | "other";
export type CpfVerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "invalid"
  | "error"
  | "not_found";


export function digits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function formatCpf(value: string | null | undefined): string {
  const cpf = digits(value).slice(0, 11);
  return cpf
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function formatCep(value: string | null | undefined): string {
  const cep = digits(value).slice(0, 8);
  return cep.replace(/^(\d{5})(\d)/, "$1-$2");
}

function isRealYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

// Máscara de digitação: dígitos -> "dd/mm/aaaa" (padrão BR).
export function formatDateBR(value: string | null | undefined): string {
  const d = digits(value).slice(0, 8);
  return d
    .replace(/^(\d{2})(\d)/, "$1/$2")
    .replace(/^(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
}

// "dd/mm/aaaa" completo e válido -> ISO "aaaa-mm-dd"; senão "".
export function brDateToIso(value: string | null | undefined): string {
  const d = digits(value);
  if (d.length !== 8) return "";
  const day = d.slice(0, 2);
  const month = d.slice(2, 4);
  const year = d.slice(4, 8);
  if (!isRealYmd(Number(year), Number(month), Number(day))) return "";
  return `${year}-${month}-${day}`;
}

// ISO "aaaa-mm-dd" -> "dd/mm/aaaa" para exibição; senão "".
export function isoToBrDate(value: string | null | undefined): string {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const [, year, month, day] = match;
  if (!isRealYmd(Number(year), Number(month), Number(day))) return "";
  return `${day}/${month}/${year}`;
}

export function normalizeContactSex(
  value: string | null | undefined,
): ContactSex | "" {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
  if (["f", "female", "feminino", "feminina", "mulher"].includes(normalized)) {
    return "female";
  }
  if (["m", "male", "masculino", "masculina", "homem"].includes(normalized)) {
    return "male";
  }
  if (
    ["other", "outro", "outra", "nao binario", "non-binary", "nonbinary"]
      .includes(normalized)
  ) {
    return "other";
  }
  return "";
}

export function contactSexLabelFor(
  value: string | null | undefined,
  locale: string,
): string {
  const sex = normalizeContactSex(value);
  if (!sex) return locale === "en-US" ? "Not informed" : "Não informado";
  const labels = locale === "en-US"
    ? { female: "Female", male: "Male", other: "Other" }
    : { female: "Feminino", male: "Masculino", other: "Outro" };
  return labels[sex];
}

export function normalizeCnpj(value: string | null | undefined): string {
  return String(value ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

export function isValidCnpj(value: string | null | undefined): boolean {
  const cnpj = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^([A-Z0-9])\1{13}$/.test(cnpj)) {
    return false;
  }

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

  return calculate(12) === Number(cnpj[12]) &&
    calculate(13) === Number(cnpj[13]);
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
  const clean = (value?: string) =>
    String(value ?? "").trim().replace(/\s+/g, " ");
  const firstName = clean(values.firstName);
  const lastName = clean(values.lastName);
  if (country === "US") {
    return {
      fullName: [firstName, lastName].filter(Boolean).join(" "),
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
  unverified: "Não verificado",
  pending: "Verificação pendente",
  verified: "Verificado",
  invalid: "CPF inválido",
  error: "Falha na verificação",
  not_found: "Não encontrado na base",
};

const cpfStatusLabelEn: Record<CpfVerificationStatus, string> = {
  unverified: "Not verified",
  pending: "Verification pending",
  verified: "Verified",
  invalid: "Invalid CPF",
  error: "Verification failed",
  not_found: "Not found in registry",
};


export function cpfStatusLabelFor(
  status: CpfVerificationStatus,
  locale: string,
): string {
  return locale === "en-US" ? cpfStatusLabelEn[status] : cpfStatusLabel[status];
}

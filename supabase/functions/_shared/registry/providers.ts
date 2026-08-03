export type LookupKind = "cep" | "cnpj" | "cpf";

export type ProviderResult =
  | {
    ok: true;
    provider: string;
    version: string;
    payload: Record<string, unknown>;
    status: number;
  }
  | {
    ok: false;
    provider: string;
    version: string;
    status: number;
    error: string;
    retryable: boolean;
    provider_code?: string | null;
    provider_message?: string | null;
  };

const TIMEOUT_MS = 6_000;
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_OPEN_MS = 60_000;
const circuits = new Map<string, { failures: number; openUntil: number }>();

export function isValidCpfValue(value: string): boolean {
  const cpf = value.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculate = (length: number): number => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculate(9) === Number(cpf[9]) && calculate(10) === Number(cpf[10]);
}

export function isValidCnpjValue(value: string): boolean {
  const cnpj = value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^([A-Z0-9])\1{13}$/.test(cnpj)) {
    return false;
  }

  const calculate = (baseLength: 12 | 13): number => {
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

class ProviderCircuitOpenError extends Error {
  constructor() {
    super("provider_circuit_open");
    this.name = "ProviderCircuitOpenError";
  }
}

async function getJson(
  circuitKey: string,
  url: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const circuit = circuits.get(circuitKey);
  if (circuit?.openUntil && circuit.openUntil > Date.now()) {
    throw new ProviderCircuitOpenError();
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal,
    });
    if (response.status >= 500 || response.status === 429) {
      const failures = (circuits.get(circuitKey)?.failures ?? 0) + 1;
      circuits.set(circuitKey, {
        failures,
        openUntil: failures >= CIRCUIT_FAILURE_THRESHOLD
          ? Date.now() + CIRCUIT_OPEN_MS
          : 0,
      });
    } else {
      circuits.delete(circuitKey);
    }
    let json: Record<string, unknown> | null = null;
    try {
      json = await response.json();
    } catch {
      // Provider returned a non-JSON error. Do not include its body in logs/errors.
    }
    return { status: response.status, json };
  } catch (error) {
    if (!(error instanceof ProviderCircuitOpenError)) {
      const failures = (circuits.get(circuitKey)?.failures ?? 0) + 1;
      circuits.set(circuitKey, {
        failures,
        openUntil: failures >= CIRCUIT_FAILURE_THRESHOLD
          ? Date.now() + CIRCUIT_OPEN_MS
          : 0,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function providerError(error: unknown): { error: string; retryable: boolean } {
  if (error instanceof ProviderCircuitOpenError) {
    return { error: "provider_circuit_open", retryable: true };
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return { error: "timeout", retryable: true };
  }
  return { error: "network_error", retryable: true };
}

function text(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
}

function normalizedSex(value: unknown): "female" | "male" | "other" | null {
  const normalized = text(value)
    ?.normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (!normalized) return null;
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
  return null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

const CPF_BRASIL_DEFAULT_VERSION = "2.0";

const CPF_BRASIL_ERROR_CODES: Record<string, string> = {
  MISSING_API_KEY: "provider_missing_api_key",
  INVALID_API_KEY: "provider_invalid_api_key",
  TOKEN_EXPIRED: "provider_token_expired",
  PLAN_EXPIRED: "provider_plan_expired",
  PLAN_SUSPENDED: "provider_plan_suspended",
  QUOTA_EXCEEDED: "provider_quota_exceeded",
  MISSING_CPF_PARAMETER: "invalid_cpf_format",
  INVALID_CPF_FORMAT: "invalid_cpf_format",
  CPF_NOT_FOUND: "not_found",
};

const PROVIDER_MESSAGE_MAX_LENGTH = 300;

/**
 * Keeps the provider explanation while removing anything that could carry PII
 * (long digit runs such as a full CPF) or credentials.
 */
export function sanitizeProviderMessage(
  value: unknown,
): string | null {
  const raw = text(value);
  if (!raw) return null;
  return raw
    .replace(/\d[\d.\-\s]{8,}\d/g, "[redacted]")
    .replace(/(key|token|secret|authorization)\s*[:=]\s*\S+/gi, "$1: [redacted]")
    .slice(0, PROVIDER_MESSAGE_MAX_LENGTH)
    .trim();
}

export function normalizeCpfBrasilResponse(
  status: number,
  json: Record<string, unknown> | null,
  cpf: string,
): ProviderResult {
  const provider = "cpf-brasil";
  const meta = record(json?.meta);
  const version = text(meta?.api_version) ?? CPF_BRASIL_DEFAULT_VERSION;
  const data = record(json?.data);

  if (status !== 200 || json?.success !== true || !data) {
    const documentedCode = text(json?.code)?.toUpperCase() ?? "";
    const error = CPF_BRASIL_ERROR_CODES[documentedCode] ??
      (status === 404
        ? "not_found"
        : status === 400 || status === 422
        ? "invalid_cpf_format"
        : status === 401 || status === 403
        ? "provider_auth_error"
        : status === 429
        ? "provider_quota_exceeded"
        : "upstream_error");

    return {
      ok: false,
      provider,
      version,
      status,
      error,
      retryable: status >= 500 || status === 0,
      provider_code: documentedCode || null,
      provider_message: sanitizeProviderMessage(json?.message ?? json?.error),
    };
  }

  return {
    ok: true,
    provider,
    version,
    status,
    payload: {
      cpf: text(data.CPF ?? data.cpf) ?? cpf,
      full_name: text(data.NOME ?? data.nome),
      registration_status: text(data.SITUACAO ?? data.situacao),
      birth_date: isoDate(data.NASC ?? data.data_nascimento),
      sex: normalizedSex(data.SEXO ?? data.sexo),
      mother_name: text(data.NOME_MAE ?? data.MAE ?? data.nome_mae),
    },
  };
}

export async function lookupBrasilApiCep(cep: string): Promise<ProviderResult> {
  const provider = "brasilapi";
  const version = "cep-v2";
  try {
    const { status, json } = await getJson(
      provider,
      `https://brasilapi.com.br/api/cep/v2/${cep}`,
    );
    if (status !== 200 || !json) {
      return {
        ok: false,
        provider,
        version,
        status,
        error: status === 404 ? "not_found" : "upstream_error",
        retryable: status >= 500 || status === 429,
      };
    }
    return {
      ok: true,
      provider,
      version,
      status,
      payload: {
        postal_code: text(json.cep) ?? cep,
        street: text(json.street),
        neighborhood: text(json.neighborhood),
        city: text(json.city),
        region: text(json.state),
        country_code: "BR",
      },
    };
  } catch (error) {
    return { ok: false, provider, version, status: 0, ...providerError(error) };
  }
}

export async function lookupViaCep(cep: string): Promise<ProviderResult> {
  const provider = "viacep";
  const version = "v1";
  try {
    const { status, json } = await getJson(
      provider,
      `https://viacep.com.br/ws/${cep}/json/`,
    );
    if (status !== 200 || !json || json.erro === true) {
      return {
        ok: false,
        provider,
        version,
        status,
        error: status === 400 || json?.erro === true
          ? "not_found"
          : "upstream_error",
        retryable: status >= 500 || status === 429,
      };
    }
    return {
      ok: true,
      provider,
      version,
      status,
      payload: {
        postal_code: text(json.cep) ?? cep,
        street: text(json.logradouro),
        neighborhood: text(json.bairro),
        city: text(json.localidade),
        region: text(json.uf),
        country_code: "BR",
      },
    };
  } catch (error) {
    return { ok: false, provider, version, status: 0, ...providerError(error) };
  }
}

export async function lookupBrasilApiCnpj(
  cnpj: string,
): Promise<ProviderResult> {
  const provider = "brasilapi";
  const version = "cnpj-v1";
  try {
    const { status, json } = await getJson(
      provider,
      `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
    );
    if (status !== 200 || !json) {
      return {
        ok: false,
        provider,
        version,
        status,
        error: status === 404 ? "not_found" : "upstream_error",
        retryable: status >= 500 || status === 429,
      };
    }
    return {
      ok: true,
      provider,
      version,
      status,
      payload: {
        cnpj: text(json.cnpj) ?? cnpj,
        legal_name: text(json.razao_social),
        trade_name: text(json.nome_fantasia),
        registration_status: text(json.descricao_situacao_cadastral),
        opened_at: isoDate(json.data_inicio_atividade),
        legal_nature: text(json.natureza_juridica),
        company_size: text(json.porte),
        primary_cnae_code: text(json.cnae_fiscal),
        primary_cnae_description: text(json.cnae_fiscal_descricao),
        email: text(json.email),
        phone: text(json.ddd_telefone_1),
        address: {
          postal_code: text(json.cep),
          street: text(json.logradouro),
          number: text(json.numero),
          complement: text(json.complemento),
          neighborhood: text(json.bairro),
          city: text(json.municipio),
          region: text(json.uf),
          country_code: "BR",
        },
      },
    };
  } catch (error) {
    return { ok: false, provider, version, status: 0, ...providerError(error) };
  }
}

export async function lookupCpfBrasil(cpf: string): Promise<ProviderResult> {
  const provider = "cpf-brasil";
  const version = CPF_BRASIL_DEFAULT_VERSION;
  const apiKey = Deno.env.get("CPF_BRASIL_API_KEY")?.trim();
  if (!apiKey) {
    return {
      ok: false,
      provider,
      version,
      status: 503,
      error: "provider_not_configured",
      retryable: false,
    };
  }
  try {
    const { status, json } = await getJson(
      provider,
      `https://api.cpf-brasil.org/cpf/${cpf}`,
      { "X-API-Key": apiKey },
    );
    return normalizeCpfBrasilResponse(status, json, cpf);
  } catch (error) {
    return { ok: false, provider, version, status: 0, ...providerError(error) };
  }
}

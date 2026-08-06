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
    providerCode?: string | null;
    providerMessage?: string | null;
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
  MISSING_CPF_PARAMETER: "invalid_or_not_found",
  INVALID_CPF_FORMAT: "invalid_or_not_found",
  CPF_NOT_FOUND: "not_found",
};

export function sanitizeProviderMessage(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  return raw
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, "[cpf]")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[email]")
    .slice(0, 300);
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
        ? "invalid_or_not_found"
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
      providerCode: documentedCode || null,
      providerMessage: sanitizeProviderMessage(json?.message ?? json?.error),
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

// --- SERPRO (Consulta CPF — Receita Federal) --------------------------------
// Fallback autoritativo do cpf-brasil. v2 (`/v2/cpf/{ni}`) consulta só pelo CPF;
// v3 (`/v3/cpf/{ni}/{nasc}`) exige a data de nascimento. Auth via OAuth2
// client-credentials (token de ~1h, cacheado em memória e compartilhado v2/v3).

const SERPRO_TOKEN_BUFFER_MS = 60_000;
let serproToken: { value: string; expiresAt: number } | null = null;

function serproConfig(): {
  key: string | undefined;
  secret: string | undefined;
  baseUrl: string;
  tokenUrl: string;
  requestTag: string | undefined;
} {
  const baseUrl = (Deno.env.get("SERPRO_CPF_BASE_URL")?.trim() ||
    "https://gateway.apiserpro.serpro.gov.br/consulta-cpf-df")
    .replace(/\/+$/, "");
  return {
    key: Deno.env.get("SERPRO_CONSUMER_KEY")?.trim(),
    secret: Deno.env.get("SERPRO_CONSUMER_SECRET")?.trim(),
    baseUrl,
    tokenUrl: Deno.env.get("SERPRO_TOKEN_URL")?.trim() ||
      "https://gateway.apiserpro.serpro.gov.br/token",
    requestTag: Deno.env.get("SERPRO_REQUEST_TAG")?.trim() || undefined,
  };
}

export function serproConfigured(): boolean {
  const { key, secret } = serproConfig();
  return Boolean(key && secret);
}

// Alguns contratos SERPRO só provisionam o v3 (o v2 retorna 403 "Resource
// forbidden"). Defina SERPRO_CPF_V2_ENABLED="false" para pular o v2 e ir direto
// ao v3, evitando uma chamada morta (~800ms) a cada fallback.
export function serproV2Enabled(): boolean {
  return Deno.env.get("SERPRO_CPF_V2_ENABLED")?.trim().toLowerCase() !== "false";
}

class SerproTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SerproTokenError";
  }
}

async function getSerproToken(forceRefresh = false): Promise<string> {
  if (
    !forceRefresh && serproToken &&
    serproToken.expiresAt - Date.now() > SERPRO_TOKEN_BUFFER_MS
  ) {
    return serproToken.value;
  }
  const { key, secret, tokenUrl } = serproConfig();
  if (!key || !secret) throw new SerproTokenError("provider_not_configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${key}:${secret}`)}`,
        // Content-Type obrigatório: o gateway responde 415 sem ele.
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
      signal: controller.signal,
    });
    if (response.status !== 200) {
      throw new SerproTokenError(`token_http_${response.status}`);
    }
    let json: Record<string, unknown> | null = null;
    try {
      json = await response.json();
    } catch {
      // resposta não-JSON — tratada como token ausente abaixo
    }
    const accessToken = text(json?.access_token);
    if (!accessToken) throw new SerproTokenError("token_missing_access_token");
    const expiresInSec = Number(json?.expires_in);
    const ttlMs = Number.isFinite(expiresInSec) && expiresInSec > 0
      ? expiresInSec * 1000
      : 3_600_000;
    serproToken = { value: accessToken, expiresAt: Date.now() + ttlMs };
    return accessToken;
  } finally {
    clearTimeout(timeout);
  }
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

// ISO (yyyy-mm-dd) -> ddmmaaaa, para montar o path do v3.
export function isoToDdmmaaaa(value: unknown): string | null {
  const raw = text(value);
  const match = raw?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, yyyy, mm, dd] = match;
  if (!isRealDate(Number(yyyy), Number(mm), Number(dd))) return null;
  return `${dd}${mm}${yyyy}`;
}

// ddmmaaaa -> ISO (yyyy-mm-dd), para ler `nascimento`/`dataInscricao` da resposta.
export function ddmmaaaaToIso(value: unknown): string | null {
  const digits = text(value)?.replace(/\D/g, "");
  if (!digits || digits.length !== 8) return null;
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  if (!isRealDate(Number(yyyy), Number(mm), Number(dd))) return null;
  return `${yyyy}-${mm}-${dd}`;
}

export function normalizeSerproResponse(
  status: number,
  json: Record<string, unknown> | null,
  cpf: string,
  version: string,
  birthDateIso: string | null,
): ProviderResult {
  const provider = "serpro";
  if (status !== 200 || !json) {
    const error = status === 404
      ? "not_found"
      : status === 400 || status === 422
      ? "invalid_or_not_found"
      : status === 401 || status === 403
      ? "provider_auth_error"
      : status === 429
      ? "provider_quota_exceeded"
      : "upstream_error";
    return {
      ok: false,
      provider,
      version,
      status,
      error,
      retryable: status >= 500 || status === 0,
      providerCode: null,
      providerMessage: sanitizeProviderMessage(
        json?.mensagem ?? json?.message ?? json?.error,
      ),
    };
  }

  const situacao = record(json.situacao);
  const registrationStatus = situacao
    ? text(situacao.descricao ?? situacao.codigo)
    : text(json.situacao);

  return {
    ok: true,
    provider,
    version,
    status,
    payload: {
      cpf: text(json.ni) ?? cpf,
      full_name: text(json.nome),
      // `situacao` fica em raw e não é exibida na UI (decisão de produto).
      registration_status: registrationStatus,
      // `nascimento` é o valor autoritativo da Receita; cai para a data de
      // entrada se a resposta não trouxer o campo.
      birth_date: ddmmaaaaToIso(json.nascimento) ?? birthDateIso,
      sex: null, // SERPRO Consulta CPF não retorna sexo.
      mother_name: text(json.nomeMae ?? json.nome_mae),
    },
  };
}

async function lookupSerpro(
  circuitKey: string,
  version: string,
  path: string,
  cpf: string,
  birthDateIso: string | null,
): Promise<ProviderResult> {
  const provider = "serpro";
  if (!serproConfigured()) {
    return {
      ok: false,
      provider,
      version,
      status: 503,
      error: "provider_not_configured",
      retryable: false,
    };
  }
  const { baseUrl, requestTag } = serproConfig();
  const url = `${baseUrl}${path}`;
  const run = async (token: string) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (requestTag) headers["x-request-tag"] = requestTag.slice(0, 32);
    return getJson(circuitKey, url, headers);
  };
  try {
    let { status, json } = await run(await getSerproToken());
    if (status === 401) {
      // Token pode ter expirado no gateway antes do TTL local: renova uma vez.
      ({ status, json } = await run(await getSerproToken(true)));
    }
    return normalizeSerproResponse(status, json, cpf, version, birthDateIso);
  } catch (error) {
    if (error instanceof SerproTokenError) {
      if (error.message === "provider_not_configured") {
        return { ok: false, provider, version, status: 503, error: "provider_not_configured", retryable: false };
      }
      // Falha ao emitir o token: 5xx/429 do endpoint de token são transitórios
      // (indisponibilidade), não erro de credencial. Só 401/403 são de auth.
      const tokenStatus = Number(error.message.match(/^token_http_(\d+)$/)?.[1] ?? 0);
      if (tokenStatus >= 500 || tokenStatus === 429) {
        return { ok: false, provider, version, status: tokenStatus, error: "upstream_error", retryable: true };
      }
      return { ok: false, provider, version, status: tokenStatus || 0, error: "provider_auth_error", retryable: false };
    }
    return { ok: false, provider, version, status: 0, ...providerError(error) };
  }
}

// v2: consulta só pelo CPF (sem data de nascimento).
export function lookupSerproCpfV2(cpf: string): Promise<ProviderResult> {
  return lookupSerpro("serpro-v2", "serpro-v2", `/v2/cpf/${cpf}`, cpf, null);
}

// v3: consulta pelo CPF + data de nascimento (ddmmaaaa no path).
export function lookupSerproCpfV3(
  cpf: string,
  birthDateIso: string,
): Promise<ProviderResult> {
  const nasc = isoToDdmmaaaa(birthDateIso);
  if (!nasc) {
    return Promise.resolve({
      ok: false,
      provider: "serpro",
      version: "serpro-v3",
      status: 422,
      error: "invalid_or_not_found",
      retryable: false,
    });
  }
  return lookupSerpro(
    "serpro-v3",
    "serpro-v3",
    `/v3/cpf/${cpf}/${nasc}`,
    cpf,
    birthDateIso,
  );
}

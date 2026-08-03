import {
  isValidCnpjValue,
  isValidCpfValue,
  normalizeCpfBrasilResponse,
} from "../supabase/functions/_shared/registry/providers.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("registry provider guard validates CPF before network calls", () => {
  assertEquals(isValidCpfValue("529.982.247-25"), true);
  assertEquals(isValidCpfValue("529.982.247-24"), false);
  assertEquals(isValidCpfValue("111.111.111-11"), false);
});

Deno.test("registry provider guard validates numeric and alphanumeric CNPJ", () => {
  assertEquals(isValidCnpjValue("04.252.011/0001-10"), true);
  assertEquals(isValidCnpjValue("04.252.011/0001-11"), false);
  assertEquals(isValidCnpjValue("12ABC34501DE35"), true);
  assertEquals(isValidCnpjValue("12ABC34501DE36"), false);
});

Deno.test("CPF Brasil v2 response maps documented identity fields", () => {
  const result = normalizeCpfBrasilResponse(200, {
    success: true,
    data: {
      CPF: "52998224725",
      NOME: "Pessoa de Teste",
      SEXO: "Feminino",
      NASC: "30/11/1899",
      NOME_MAE: "Mãe de Teste",
    },
    meta: { api_version: "2.0" },
  }, "52998224725");

  if (!result.ok) throw new Error(`Expected success, received ${result.error}`);
  assertEquals(result.version, "2.0");
  assertEquals(result.payload.full_name, "Pessoa de Teste");
  assertEquals(result.payload.birth_date, "1899-11-30");
  assertEquals(result.payload.sex, "female");
  assertEquals(result.payload.mother_name, "Mãe de Teste");
});

Deno.test("CPF Brasil v2 maps documented failures and keeps sanitized provider detail", () => {
  const expired = normalizeCpfBrasilResponse(401, {
    error: "Unauthorized",
    message: "Token expired for key: abc123secret",
    code: "TOKEN_EXPIRED",
  }, "52998224725");
  const notFound = normalizeCpfBrasilResponse(404, {
    code: "CPF_NOT_FOUND",
    message: "CPF 529.982.247-25 não encontrado",
  }, "52998224725");
  const badFormat = normalizeCpfBrasilResponse(400, {
    code: "INVALID_CPF_FORMAT",
  }, "52998224725");

  if (expired.ok || notFound.ok || badFormat.ok) throw new Error("Expected provider failures");
  assertEquals(expired.error, "provider_token_expired");
  assertEquals(expired.retryable, false);
  assertEquals(expired.provider_code, "TOKEN_EXPIRED");
  assertEquals(expired.provider_message?.includes("abc123secret"), false);
  assertEquals(notFound.error, "not_found");
  assertEquals(notFound.retryable, false);
  assertEquals(notFound.provider_code, "CPF_NOT_FOUND");
  assertEquals(notFound.provider_message?.includes("529.982.247-25"), false);
  assertEquals(badFormat.error, "invalid_cpf_format");
});

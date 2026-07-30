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
  assertEquals(result.payload.mother_name, "Mãe de Teste");
});

Deno.test("CPF Brasil v2 maps documented failures without exposing provider messages", () => {
  const expired = normalizeCpfBrasilResponse(401, {
    error: "Unauthorized",
    message: "Sensitive provider message",
    code: "TOKEN_EXPIRED",
  }, "52998224725");
  const notFound = normalizeCpfBrasilResponse(404, {
    code: "CPF_NOT_FOUND",
  }, "52998224725");

  if (expired.ok || notFound.ok) throw new Error("Expected provider failures");
  assertEquals(expired.error, "provider_token_expired");
  assertEquals(expired.retryable, false);
  assertEquals(notFound.error, "invalid_or_not_found");
  assertEquals(notFound.retryable, false);
});

import {
  isValidCnpjValue,
  isValidCpfValue,
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

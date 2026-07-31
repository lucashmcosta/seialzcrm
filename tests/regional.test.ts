import {
  canonicalContactName,
  isValidCnpj,
  isValidCpf,
  normalizeCnpj,
} from "../src/lib/regional.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

Deno.test("BR keeps full_name authoritative and never infers parts", () => {
  assertEquals(
    canonicalContactName("BR", { fullName: "  Maria da Silva  " }),
    { fullName: "Maria da Silva", firstName: null, lastName: null },
  );
});

Deno.test("US composes full_name from the supplied parts", () => {
  assertEquals(
    canonicalContactName("US", {
      fullName: "ignored",
      firstName: "  Mary ",
      lastName: " Ann Smith ",
    }),
    { fullName: "Mary Ann Smith", firstName: "Mary", lastName: "Ann Smith" },
  );
});

Deno.test("CPF validates check digits and repeated digits", () => {
  assertEquals(isValidCpf("529.982.247-25"), true);
  assertEquals(isValidCpf("529.982.247-24"), false);
  assertEquals(isValidCpf("111.111.111-11"), false);
});

Deno.test("CNPJ normalizes and validates check digits", () => {
  assertEquals(normalizeCnpj("04.252.011/0001-10"), "04252011000110");
  assertEquals(isValidCnpj("04.252.011/0001-10"), true);
  assertEquals(isValidCnpj("04.252.011/0001-11"), false);
  assertEquals(isValidCnpj("12ABC34501DE35"), true);
  assertEquals(isValidCnpj("12ABC34501DE36"), false);
});

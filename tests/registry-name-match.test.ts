import {
  decidePersonNameMatch,
  normalizePersonName,
} from "../supabase/functions/_shared/registry/name-match.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

Deno.test("name matcher ignores casing, accents and Brazilian particles", () => {
  assertEquals(normalizePersonName("  João da Silva "), "JOAO DA SILVA");
  assertEquals(
    decidePersonNameMatch("João da Silva", "JOAO DA SILVA").decision,
    "exact",
  );
});

Deno.test("name matcher accepts only high-confidence additions and small differences", () => {
  assertEquals(
    decidePersonNameMatch("Maria Silva", "Maria Aparecida da Silva").decision,
    "auto_merge",
  );
  assertEquals(
    decidePersonNameMatch(
      "Carlos Eduardo Santos",
      "Carlos Eduardo da Silva Santos",
    ).decision,
    "auto_merge",
  );
});

Deno.test("name matcher sends material divergence and single-name records to review", () => {
  assertEquals(
    decidePersonNameMatch("João Souza", "João Silva").decision,
    "review",
  );
  assertEquals(
    decidePersonNameMatch("Maria", "Maria Oliveira").decision,
    "review",
  );
  assertEquals(
    decidePersonNameMatch("Luiz Silva", "Luis Silva").decision,
    "review",
  );
});

Deno.test("name matcher can fill empty names but never invents a missing provider name", () => {
  assertEquals(decidePersonNameMatch("", "Ana Souza").decision, "fill_empty");
  assertEquals(
    decidePersonNameMatch("Ana Souza", "").decision,
    "provider_name_missing",
  );
});

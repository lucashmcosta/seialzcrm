import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { isActiveMember } from "./membership.ts";

function fake(result: { data: unknown; error: unknown }, seen: Record<string, unknown> = {}) {
  const q: any = {
    select: () => q,
    eq: (k: string, v: unknown) => { seen[k] = v; return q; },
    limit: () => Promise.resolve(result),
  };
  return { from: (t: string) => { seen.table = t; return q; } };
}

Deno.test("vínculo ativo libera envio e filtra por org e is_active", async () => {
  const seen: Record<string, unknown> = {};
  assertEquals(await isActiveMember(fake({ data: [{ user_id: "u" }], error: null }, seen), "u", "o"), true);
  assertEquals(seen, { table: "user_organizations", user_id: "u", organization_id: "o", is_active: true });
});

Deno.test("sem vínculo ativo bloqueia", async () => {
  assertEquals(await isActiveMember(fake({ data: [], error: null }), "u", "o"), false);
});

Deno.test("sem organização no job bloqueia", async () => {
  assertEquals(await isActiveMember(fake({ data: [{}], error: null }), "u", ""), false);
});

Deno.test("erro na consulta lança (fail-closed)", async () => {
  await assertRejects(() => isActiveMember(fake({ data: null, error: { message: "x" } }), "u", "o"));
});

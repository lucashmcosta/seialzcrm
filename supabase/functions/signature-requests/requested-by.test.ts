import { assertEquals } from "jsr:@std/assert@1";
import { resolveRequestedBy, AuthorLookup } from "./requested-by.ts";

const ORG = "40ae935c-a7f7-4ad7-8ea4-91be6404a95f", OTHER = "11111111-1111-1111-1111-111111111111";
const users: Record<string, { id: string; full_name: string | null; email: string | null }> = {
  vic: { id: "vic", full_name: "Victoria Amorim", email: "vamorim@centraltrabalhista.com.br" },
  jun: { id: "jun", full_name: "Junior", email: "njunior@centraltrabalhista.com.br" },
  ana: { id: "ana", full_name: "Ana Comercial", email: "ana@centraltrabalhista.com.br" },
  ext: { id: "ext", full_name: "Externo", email: "x@outra.com" },
  noe: { id: "noe", full_name: "Sem Email", email: "invalido" },
};
const orgOf: Record<string, string> = { vic: ORG, jun: ORG, ana: ORG, ext: OTHER, noe: ORG };
const db: AuthorLookup = {
  getUser: async (id) => users[id] ?? null,
  isActiveMember: async (u, o) => orgOf[u] === o,
};
const req = (created_by: string | null) => ({ created_by, organization_id: ORG });

Deno.test("A Victoria", async () => assertEquals(await resolveRequestedBy(req("vic"), db),
  { external_user_id: "vic", name: "Victoria Amorim", email: "vamorim@centraltrabalhista.com.br" }));
Deno.test("B Junior", async () => assertEquals((await resolveRequestedBy(req("jun"), db))?.email, "njunior@centraltrabalhista.com.br"));
Deno.test("C outro usuário", async () => assertEquals((await resolveRequestedBy(req("ana"), db))?.name, "Ana Comercial"));
Deno.test("D body falsificado não é entrada", async () => {
  const r = { ...req("vic"), requested_by: { email: "outra@x.com" } };
  assertEquals((await resolveRequestedBy(r, db))?.email, "vamorim@centraltrabalhista.com.br");
});
Deno.test("E/F retry por outro usuário mantém autor", async () => {
  const a = await resolveRequestedBy(req("vic"), db), b = await resolveRequestedBy(req("vic"), db);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});
Deno.test("H autor de outra org → null (422)", async () => assertEquals(await resolveRequestedBy(req("ext"), db), null));
Deno.test("I created_by inexistente → null", async () => {
  assertEquals(await resolveRequestedBy(req("zzz"), db), null);
  assertEquals(await resolveRequestedBy(req(null), db), null);
});
Deno.test("J e-mail inválido → null", async () => assertEquals(await resolveRequestedBy(req("noe"), db), null));

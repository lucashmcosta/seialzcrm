// Matriz de autorização de authorizeOrgRequest — a decisão usada por
// meta-capi-connect, meta-capi-connect-from-existing, meta-lead-ads-discover e
// meta-lead-ads-connect (cada uma passa o organization_id do body).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authorizeOrgRequest } from "./membership.ts";
import { fakeAdmin, ORG, OTHER, req } from "./fake-admin.testutil.ts";

Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");

const status = async (token: string | undefined, org: string | null = ORG, admin = fakeAdmin()) => {
  const d = await authorizeOrgRequest(req(token), admin, org);
  return d.ok ? `ok:${d.caller.kind}` : `${d.status}:${d.error}`;
};

Deno.test("service_role key → ok (qualquer org)", async () => {
  assertEquals(await status("service-key", OTHER), "ok:service");
});

Deno.test("token interno (Vault) → ok (qualquer org)", async () => {
  assertEquals(await status("internal-token", OTHER), "ok:internal");
});

Deno.test("membro ativo → ok", async () => {
  assertEquals(await status("jwt:auth-member", ORG), "ok:user");
});

Deno.test("membro de outra org → 403 forbidden_org", async () => {
  assertEquals(await status("jwt:auth-outsider", ORG), "403:forbidden_org");
});

Deno.test("membro inativo → 403 forbidden_org", async () => {
  assertEquals(await status("jwt:auth-inactive", ORG), "403:forbidden_org");
});

Deno.test("auth user sem linha em users → 403", async () => {
  assertEquals(await status("jwt:auth-ghost", ORG), "403:forbidden_org");
});

Deno.test("bearer inválido → 401", async () => {
  assertEquals((await status("garbage")).startsWith("401:"), true);
});

Deno.test("sem Authorization → 401", async () => {
  assertEquals((await status(undefined)).startsWith("401:"), true);
});

Deno.test("anon key (JWT sem sub) → 401", async () => {
  assertEquals((await status("anon-key")).startsWith("401:"), true);
});

Deno.test("erro de leitura da membership → 403 (fail-closed)", async () => {
  assertEquals(await status("jwt:auth-member", ORG, fakeAdmin({ failQueries: true })), "403:forbidden_org");
});

Deno.test("sem organization_id → ok (handler devolve o 400), mas token ainda é exigido", async () => {
  assertEquals(await status("jwt:auth-outsider", null), "ok:user");
  assertEquals((await status("garbage", null)).startsWith("401:"), true);
});

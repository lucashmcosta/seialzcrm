import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callerCanAccessOrg, isActiveOrgMember, resolveCaller } from "./membership.ts";

Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");

const ORG = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {
  users: [
    { id: "u-member", auth_user_id: "auth-member" },
    { id: "u-inactive", auth_user_id: "auth-inactive" },
    { id: "u-outsider", auth_user_id: "auth-outsider" },
  ],
  user_organizations: [
    { user_id: "u-member", organization_id: ORG, is_active: true },
    { user_id: "u-inactive", organization_id: ORG, is_active: false },
    { user_id: "u-outsider", organization_id: OTHER, is_active: true },
  ],
};

function fakeAdmin(opts: { failQueries?: boolean } = {}) {
  return {
    rpc: (name: string) =>
      Promise.resolve({ data: name === "get_internal_function_auth_token" ? "internal-token" : null, error: null }),
    auth: {
      getClaims: (token: string) =>
        Promise.resolve(
          token.startsWith("jwt:")
            ? { data: { claims: { sub: token.slice(4) } }, error: null }
            : { data: null, error: { message: "bad jwt" } },
        ),
    },
    from: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
        in: (c: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[c])); return q; },
        limit: (n: number) => { rows = rows.slice(0, n); return q; },
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve(opts.failQueries ? { data: null, error: { message: "boom" } } : { data: rows, error: null }).then(res),
      };
      return q;
    },
  };
}

const req = (token?: string) =>
  new Request("http://x", { headers: token ? { authorization: `Bearer ${token}` } : {} });

Deno.test("service_role key → service, bypasses membership", async () => {
  const admin = fakeAdmin();
  const c = await resolveCaller(req("service-key"), admin);
  assertEquals(c, { ok: true, kind: "service" });
  assert(c.ok && await callerCanAccessOrg(admin, c, OTHER));
});

Deno.test("internal function token → internal, bypasses membership", async () => {
  const admin = fakeAdmin();
  const c = await resolveCaller(req("internal-token"), admin);
  assertEquals(c, { ok: true, kind: "internal" });
  assert(c.ok && await callerCanAccessOrg(admin, c, ORG));
});

Deno.test("active member → allowed", async () => {
  const admin = fakeAdmin();
  const c = await resolveCaller(req("jwt:auth-member"), admin);
  assertEquals(c, { ok: true, kind: "user", authUserId: "auth-member" });
  assert(c.ok && await callerCanAccessOrg(admin, c, ORG));
});

Deno.test("member of another org → forbidden", async () => {
  const admin = fakeAdmin();
  const c = await resolveCaller(req("jwt:auth-outsider"), admin);
  assert(c.ok && !(await callerCanAccessOrg(admin, c, ORG)));
  assert(c.ok && await callerCanAccessOrg(admin, c, OTHER));
});

Deno.test("inactive membership → forbidden", async () => {
  assertEquals(await isActiveOrgMember(fakeAdmin(), "auth-inactive", ORG), false);
});

Deno.test("unknown auth user → forbidden", async () => {
  assertEquals(await isActiveOrgMember(fakeAdmin(), "auth-ghost", ORG), false);
});

Deno.test("query error → fail closed", async () => {
  assertEquals(await isActiveOrgMember(fakeAdmin({ failQueries: true }), "auth-member", ORG), false);
});

Deno.test("missing / invalid bearer → not ok", async () => {
  assertEquals((await resolveCaller(req(), fakeAdmin())).ok, false);
  assertEquals((await resolveCaller(req("garbage"), fakeAdmin())).ok, false);
});

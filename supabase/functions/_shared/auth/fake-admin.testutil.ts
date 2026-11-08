// Fake mínimo do admin client (service_role) p/ testes de autorização.
// Tokens: "service-key" (env), "internal-token" (RPC), "jwt:<auth_user_id>" (usuário),
// "anon-key" (JWT válido SEM sub, como a anon key) e qualquer outra coisa = inválido.
export const ORG = "11111111-1111-1111-1111-111111111111";
export const OTHER = "22222222-2222-2222-2222-222222222222";

type Row = Record<string, unknown>;

export function baseTables(): Record<string, Row[]> {
  return {
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
    capi_event_log: [
      { id: "log-org", organization_id: ORG },
      { id: "log-other", organization_id: OTHER },
    ],
  };
}

export function fakeAdmin(opts: { failQueries?: boolean; tables?: Record<string, Row[]> } = {}) {
  const tables = opts.tables ?? baseTables();
  const calls: string[] = [];
  return {
    calls,
    rpc: (name: string) =>
      Promise.resolve({ data: name === "get_internal_function_auth_token" ? "internal-token" : null, error: null }),
    auth: {
      getClaims: (token: string) =>
        Promise.resolve(
          token.startsWith("jwt:")
            ? { data: { claims: { sub: token.slice(4), role: "authenticated" } }, error: null }
            : token === "anon-key"
            ? { data: { claims: { role: "anon" } }, error: null }
            : { data: null, error: { message: "bad jwt" } },
        ),
    },
    from: (table: string) => {
      calls.push(table);
      let rows = [...(tables[table] ?? [])];
      const result = () =>
        opts.failQueries ? { data: null, error: { message: "boom" } } : { data: rows, error: null };
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
        in: (c: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[c])); return q; },
        limit: (n: number) => { rows = rows.slice(0, n); return q; },
        maybeSingle: () => {
          const r = result();
          return Promise.resolve(r.error ? r : { data: rows[0] ?? null, error: null });
        },
        then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
      };
      return q;
    },
  };
}

export const req = (token?: string) =>
  new Request("http://x", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} });

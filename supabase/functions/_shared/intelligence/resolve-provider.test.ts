// Deno tests for resolve-provider.ts using an in-memory fake SupabaseClient.
// Verifies multi-tenant isolation, BYOK priority, budget enforcement,
// revoke effect, and that resolution never leaks api keys.
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

const TEST_KEY = "b".repeat(64);
Deno.env.set("META_TOKEN_ENCRYPTION_KEY", TEST_KEY);

const { encryptSecret } = await import("../crypto.ts");
const { resolveProvider, markByokInvalid, ProviderResolutionError } = await import(
  "./resolve-provider.ts"
);

// -- Fake SupabaseClient --------------------------------------------------
type Row = {
  id: string;
  organization_id: string;
  secret_payload: Record<string, any> | null;
};

function makeFakeAdmin(initial: {
  rows: Row[];
  byokCostByOrgProvider?: Record<string, number>;
}) {
  const state = {
    rows: structuredClone(initial.rows),
    byokCostByOrgProvider: { ...(initial.byokCostByOrgProvider ?? {}) },
  };

  function from(table: string) {
    if (table === "organization_integrations") {
      const builder: any = {
        _filters: {} as Record<string, any>,
        _notNull: null as string | null,
        _pendingUpdate: null as Record<string, any> | null,
        select() { return this; },
        eq(col: string, val: any) {
          this._filters[col] = val;
          // If an update is pending, apply once filters are set (each .eq returns a still-chainable thenable).
          return this;
        },
        not(col: string, _op: string, _val: any) { this._notNull = col; return this; },
        update(patch: Record<string, any>) {
          this._pendingUpdate = patch;
          return this;
        },
        async maybeSingle() {
          const list = this._run();
          return { data: list[0] ?? null, error: null };
        },
        then(resolve: any) {
          if (this._pendingUpdate) {
            for (const r of state.rows) {
              let match = true;
              for (const [k, v] of Object.entries(this._filters)) {
                if ((r as any)[k] !== v) { match = false; break; }
              }
              if (match) Object.assign(r, this._pendingUpdate);
            }
            resolve({ error: null });
            return;
          }
          resolve({ data: this._run(), error: null });
        },
        _run() {
          return state.rows.filter((r) => {
            for (const [k, v] of Object.entries(this._filters)) {
              if ((r as any)[k] !== v) return false;
            }
            if (this._notNull === "secret_payload" && r.secret_payload == null) return false;
            return true;
          });
        },
      };
      return builder;
    }
    if (table === "vw_org_monthly_cost_byok") {
      const builder: any = {
        _f: {} as Record<string, any>,
        select() { return this; },
        eq(c: string, v: any) { this._f[c] = v; return this; },
        gte(_c: string, _v: any) { return this; },
        then(resolve: any) {
          const key = `${this._f.organization_id}::${this._f.provider}`;
          const cost = state.byokCostByOrgProvider[key] ?? 0;
          resolve({ data: [{ cost_usd: cost }], error: null });
        },
      };
      return builder;
    }
    throw new Error(`unexpected table ${table}`);
  }

  return { from } as any;
}

// -- Helpers ---------------------------------------------------------------
async function activeOpenAIEntry(opts: {
  apiKey?: string;
  budget?: number | null;
  fallback?: boolean;
} = {}) {
  return {
    api_key_encrypted: await encryptSecret(opts.apiKey ?? "sk-fake-1234567890abcdef"),
    is_active: true,
    verified_at: new Date().toISOString(),
    last_error: null,
    fallback_to_managed: !!opts.fallback,
    fallback_on_rate_limit: false,
    monthly_budget_usd: opts.budget ?? null,
  };
}

// -- Tests -----------------------------------------------------------------

Deno.test("resolveProvider returns customer_key with decrypted key", async () => {
  const admin = makeFakeAdmin({
    rows: [{
      id: "r1",
      organization_id: "org-A",
      secret_payload: { openai: await activeOpenAIEntry({ apiKey: "sk-test-AAAAAAAAAA" }) },
    }],
  });
  const r = await resolveProvider(admin, "org-A", "chat");
  assertEquals(r.source, "customer_key");
  assertEquals(r.provider, "openai");
  assertEquals(r.apiKey, "sk-test-AAAAAAAAAA");
});

Deno.test("resolveProvider isolates orgs (no cross-tenant key leak)", async () => {
  const admin = makeFakeAdmin({
    rows: [
      { id: "r1", organization_id: "org-A", secret_payload: { openai: await activeOpenAIEntry({ apiKey: "sk-AAA-111" }) } },
      { id: "r2", organization_id: "org-B", secret_payload: { openai: await activeOpenAIEntry({ apiKey: "sk-BBB-222" }) } },
    ],
  });
  const a = await resolveProvider(admin, "org-A", "chat");
  const b = await resolveProvider(admin, "org-B", "chat");
  assertEquals(a.apiKey, "sk-AAA-111");
  assertEquals(b.apiKey, "sk-BBB-222");
  assert(a.apiKey !== b.apiKey);
});

Deno.test("resolveProvider skips inactive/unverified BYOK entries", async () => {
  const admin = makeFakeAdmin({
    rows: [{
      id: "r1",
      organization_id: "org-A",
      secret_payload: {
        openai: {
          ...(await activeOpenAIEntry()),
          is_active: false, // revoked
          verified_at: null,
        },
      },
    }],
  });
  // No managed keys configured -> must raise no_provider
  await assertRejects(
    () => resolveProvider(admin, "org-A", "chat"),
    ProviderResolutionError,
  );
});

Deno.test("resolveProvider enforces BYOK monthly budget", async () => {
  const admin = makeFakeAdmin({
    rows: [{
      id: "r1",
      organization_id: "org-A",
      secret_payload: { openai: await activeOpenAIEntry({ budget: 10 }) },
    }],
    byokCostByOrgProvider: { "org-A::openai": 12.5 },
  });
  const err = await assertRejects(
    () => resolveProvider(admin, "org-A", "chat"),
    ProviderResolutionError,
  );
  assertEquals((err as any).code, "budget_exceeded");
});

Deno.test("resolveProvider under budget still resolves", async () => {
  const admin = makeFakeAdmin({
    rows: [{
      id: "r1",
      organization_id: "org-A",
      secret_payload: { openai: await activeOpenAIEntry({ budget: 100 }) },
    }],
    byokCostByOrgProvider: { "org-A::openai": 5 },
  });
  const r = await resolveProvider(admin, "org-A", "chat");
  assertEquals(r.source, "customer_key");
  assertEquals(r.monthlyBudgetUsd, 100);
});

Deno.test("resolveProvider raises no_provider when no BYOK & no managed", async () => {
  const admin = makeFakeAdmin({ rows: [] });
  await assertRejects(
    () => resolveProvider(admin, "org-orphan", "chat"),
    ProviderResolutionError,
  );
});

Deno.test("markByokInvalid disables only the matching provider, never logs key", async () => {
  const entry = await activeOpenAIEntry({ apiKey: "sk-toBeInvalidated-XYZ" });
  const admin = makeFakeAdmin({
    rows: [{
      id: "r1",
      organization_id: "org-A",
      secret_payload: { openai: entry, elevenlabs: { ...entry } },
    }],
  });

  // capture console output to assert no key leakage
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...a) => { logs.push(a.map(String).join(" ")); };
  try {
    await markByokInvalid(admin, "org-A", "openai", "invalid_key");
  } finally {
    console.log = origLog;
  }

  // After invalidation, resolveProvider must NOT return openai
  await assertRejects(
    () => resolveProvider(admin, "org-A", "chat"),
    ProviderResolutionError,
  );

  // elevenlabs entry untouched
  // (state inspection via fake)
  const row = (admin as any).from("organization_integrations")
    .select().eq("organization_id", "org-A");
  const data = await row;
  const payload = data.data[0].secret_payload;
  assertEquals(payload.openai.is_active, false);
  assertEquals(payload.openai.last_error, "invalid_key");
  assertEquals(payload.elevenlabs.is_active, true);

  // no log line contains the key
  for (const l of logs) assert(!l.includes("sk-toBeInvalidated-XYZ"));
});

Deno.test("resolveProvider never logs decrypted key on success", async () => {
  const admin = makeFakeAdmin({
    rows: [{
      id: "r1",
      organization_id: "org-A",
      secret_payload: { openai: await activeOpenAIEntry({ apiKey: "sk-LOG-LEAK-CHECK-9999" }) },
    }],
  });
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...a) => { logs.push(a.map(String).join(" ")); };
  try {
    const r = await resolveProvider(admin, "org-A", "chat");
    assertEquals(r.apiKey, "sk-LOG-LEAK-CHECK-9999");
  } finally {
    console.log = origLog;
  }
  for (const l of logs) assert(!l.includes("sk-LOG-LEAK-CHECK-9999"), `leaked in: ${l}`);
});

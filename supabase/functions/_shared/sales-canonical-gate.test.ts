// ============================================================
// Bateria T1–T10 — gate canônico Comercial (Fase 2 / Etapa A.1)
//
// Stub de banco em memória: NENHUMA escrita em produção, nenhuma rede.
// ============================================================

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { salesCanonicalPathEnabled } from "./sales-canonical-gate.ts";
import { resolveSalesWhatsappThread } from "./sales-thread.ts";

type Row = Record<string, unknown>;

type Fixture = {
  communication_endpoints: Row[];
  messaging_line_endpoints: Row[];
  messaging_lines: Row[];
  feature_flags: Row[];
  message_threads: Row[];
};

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const CONTACT = "22222222-2222-4222-8222-222222222222";
const EP_SALES = "33333333-3333-4333-8333-333333333333";
const EP_SALES_2 = "34343434-3434-4343-8343-343434343434";
const EP_CS = "44444444-4444-4444-8444-444444444444";
const EP_NULL = "55555555-5555-4555-8555-555555555555";
const LINE = "66666666-6666-4666-8666-666666666666";

// --- Stub mínimo do PostgREST builder ----------------------------------------
function makeDb(fx: Fixture) {
  const updates: Array<{ table: string; patch: Row; id: unknown }> = [];
  const inserts: Array<{ table: string; row: Row }> = [];

  function builder(table: string) {
    let rows = ((fx as unknown as Record<string, Row[]>)[table] ?? []).slice();
    let mode: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    let pending: Row | null = null;
    const eqs: Array<[string, unknown]> = [];

    const api: any = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        eqs.push([col, val]);
        rows = rows.filter((r) => r[col] === val);
        return api;
      },
      is: (col: string, val: unknown) => {
        rows = rows.filter((r) => (val === null ? r[col] == null : r[col] === val));
        return api;
      },
      not: (col: string, _op: string, val: unknown) => {
        rows = rows.filter((r) => (val === null ? r[col] != null : r[col] !== val));
        return api;
      },
      in: (col: string, vals: unknown[]) => {
        rows = rows.filter((r) => vals.includes(r[col] as never));
        return api;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        const asc = opts?.ascending !== false;
        rows.sort((a, b) => {
          const x = String(a[col] ?? "");
          const y = String(b[col] ?? "");
          return asc ? x.localeCompare(y) : y.localeCompare(x);
        });
        return api;
      },
      limit: (n: number) => {
        rows = rows.slice(0, n);
        return api;
      },
      update: (p: Row) => {
        mode = "update";
        patch = p;
        return api;
      },
      insert: (r: Row) => {
        mode = "insert";
        pending = r;
        return api;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => {
        if (mode === "insert") return api.then();
        return { data: rows[0] ?? null, error: null };
      },
      then: (resolve?: (v: { data: unknown; error: null }) => unknown) => {
        let out: { data: unknown; error: null };
        if (mode === "update") {
          for (const r of rows) {
            Object.assign(r, patch);
            updates.push({ table, patch, id: r.id });
          }
          out = { data: null, error: null };
        } else if (mode === "insert") {
          const row = { id: crypto.randomUUID(), ...(pending as Row) };
          ((fx as unknown as Record<string, Row[]>)[table] ??= []).push(row);
          inserts.push({ table, row });
          out = { data: row, error: null };
        } else {
          out = { data: rows, error: null };
        }
        return Promise.resolve(resolve ? resolve(out) : out);
      },
    };
    return api;
  }

  return { db: { from: builder }, updates, inserts, fx };
}

function baseFixture(opts?: {
  flagEnabled?: boolean;
  flagOrgs?: string[];
  routeActive?: boolean;
  linkActive?: boolean;
  activeEndpoint?: string | null;
  threads?: Row[];
}): Fixture {
  return {
    communication_endpoints: [
      { id: EP_SALES, purpose: "sales" },
      { id: EP_SALES_2, purpose: "commercial" },
      { id: EP_CS, purpose: "customer_service" },
      { id: EP_NULL, purpose: null },
    ],
    messaging_line_endpoints: [
      { id: "l1", line_id: LINE, endpoint_id: EP_SALES, is_active: opts?.linkActive !== false },
      { id: "l2", line_id: LINE, endpoint_id: EP_SALES_2, is_active: true },
    ],
    messaging_lines: [{
      id: LINE,
      organization_id: ORG,
      channel: "whatsapp",
      inbox_key: "sales",
      is_active: opts?.routeActive !== false,
      active_endpoint_id: opts?.activeEndpoint === undefined ? EP_SALES : opts.activeEndpoint,
    }],
    feature_flags: [{
      name: "conv_route_resolver_v2",
      is_enabled: opts?.flagEnabled === true,
      organization_ids: opts?.flagOrgs ?? [],
    }],
    message_threads: opts?.threads ?? [],
  };
}

const gate = (fx: Fixture, endpointId: string, organizationId: string = ORG) =>
  salesCanonicalPathEnabled(makeDb(fx).db, { organizationId, endpointId });

// ---------------------------------------------------------------- T1
Deno.test("T1 — Comercial + Route V2 + flag OFF => legado (flag_off)", async () => {
  const r = await gate(baseFixture({ flagEnabled: false }), EP_SALES);
  assertEquals(r.allowed, false);
  assertEquals(r.reason, "flag_off");
  assertEquals(r.lineId, LINE);
});

// ---------------------------------------------------------------- T2
Deno.test("T2 — Comercial + Route V2 + flag ON para a org => canônico", async () => {
  const r = await gate(baseFixture({ flagEnabled: true, flagOrgs: [ORG] }), EP_SALES);
  assertEquals(r.allowed, true);
  assertEquals(r.reason, "allowed");
  assertEquals(r.lineId, LINE);

  // flag ON mas apenas para OUTRA org => legado
  const r2 = await gate(baseFixture({ flagEnabled: true, flagOrgs: [OTHER_ORG] }), EP_SALES);
  assertEquals(r2.allowed, false);
  assertEquals(r2.reason, "flag_off");
});

// ---------------------------------------------------------------- T3
Deno.test("T3 — Comercial sem Route V2 + flag ON => legado (no_route_v2)", async () => {
  const noLink = await gate(
    baseFixture({ flagEnabled: true, flagOrgs: [ORG], linkActive: false }),
    EP_SALES,
  );
  assertEquals(noLink.reason, "no_route_v2");

  const lineOff = await gate(
    baseFixture({ flagEnabled: true, flagOrgs: [ORG], routeActive: false }),
    EP_SALES,
  );
  assertEquals(lineOff.reason, "no_route_v2");

  const noActiveEp = await gate(
    baseFixture({ flagEnabled: true, flagOrgs: [ORG], activeEndpoint: null }),
    EP_SALES,
  );
  assertEquals(noActiveEp.reason, "no_route_v2");

  // Route de OUTRA organização não vale
  const otherOrg = await gate(
    baseFixture({ flagEnabled: true, flagOrgs: [] }),
    EP_SALES,
    OTHER_ORG,
  );
  assertEquals(otherOrg.reason, "no_route_v2");
});

// ---------------------------------------------------------------- T4
Deno.test("T4 — endpoint Atendimento + flag ON => legado", async () => {
  const r = await gate(baseFixture({ flagEnabled: true, flagOrgs: [] }), EP_CS);
  assertEquals(r.allowed, false);
  assertEquals(r.reason, "not_sales_endpoint");
});

// ---------------------------------------------------------------- T5
Deno.test("T5 — purpose NULL => legado", async () => {
  const r = await gate(baseFixture({ flagEnabled: true, flagOrgs: [] }), EP_NULL);
  assertEquals(r.allowed, false);
  assertEquals(r.reason, "not_sales_endpoint");
});

// ---------------------------------------------------------------- T6
Deno.test("T6 — thread canônica viva mais antiga é reutilizada; loser nunca", async () => {
  const fx = baseFixture({
    flagEnabled: true,
    flagOrgs: [ORG],
    threads: [
      {
        id: "loser",
        organization_id: ORG,
        contact_id: CONTACT,
        channel: "whatsapp",
        business_context: "sales",
        merged_into_thread_id: "alive-old",
        status: "open",
        primary_endpoint_id: EP_SALES,
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "alive-old",
        organization_id: ORG,
        contact_id: CONTACT,
        channel: "whatsapp",
        business_context: "sales",
        merged_into_thread_id: null,
        status: "open",
        primary_endpoint_id: EP_SALES,
        created_at: "2026-02-01T00:00:00Z",
      },
      {
        id: "alive-new",
        organization_id: ORG,
        contact_id: CONTACT,
        channel: "whatsapp",
        business_context: "sales",
        merged_into_thread_id: null,
        status: "open",
        primary_endpoint_id: EP_SALES,
        created_at: "2026-03-01T00:00:00Z",
      },
    ],
  });
  const g = await gate(fx, EP_SALES);
  assertEquals(g.allowed, true);

  const h = makeDb(fx);
  const res = await resolveSalesWhatsappThread(h.db, {
    organizationId: ORG,
    contactId: CONTACT,
    endpointId: EP_SALES,
  });
  assertEquals(res.threadId, "alive-old");
  assertEquals(res.outcome, "reused");
  assertEquals(res.endpointRotated, false);
  assertEquals(h.inserts.length, 0);
});

// ---------------------------------------------------------------- T7
Deno.test("T7 — thread resolved/closed + flag ON => reopen (status open, resolved_at null)", async () => {
  for (const st of ["resolved", "closed"]) {
    const fx = baseFixture({
      flagEnabled: true,
      flagOrgs: [ORG],
      threads: [{
        id: "t-closed",
        organization_id: ORG,
        contact_id: CONTACT,
        channel: "whatsapp",
        business_context: "sales",
        merged_into_thread_id: null,
        status: st,
        resolved_at: "2026-05-01T00:00:00Z",
        primary_endpoint_id: EP_SALES,
        created_at: "2026-01-01T00:00:00Z",
      }],
    });
    assertEquals((await gate(fx, EP_SALES)).allowed, true);

    const h = makeDb(fx);
    const res = await resolveSalesWhatsappThread(h.db, {
      organizationId: ORG,
      contactId: CONTACT,
      endpointId: EP_SALES,
    });
    assertEquals(res.threadId, "t-closed");
    assertEquals(res.outcome, "reopened");
    const row = h.fx.message_threads[0];
    assertEquals(row.status, "open");
    assertEquals(row.resolved_at, null);
  }
});

// ---------------------------------------------------------------- T8
Deno.test("T8 — inbound por outro endpoint da mesma Route => mesma thread + rotação", async () => {
  const fx = baseFixture({
    flagEnabled: true,
    flagOrgs: [ORG],
    threads: [{
      id: "t-rot",
      organization_id: ORG,
      contact_id: CONTACT,
      channel: "whatsapp",
      business_context: "sales",
      merged_into_thread_id: null,
      status: "open",
      primary_endpoint_id: EP_SALES,
      created_at: "2026-01-01T00:00:00Z",
    }],
  });
  // EP_SALES_2 pertence à MESMA Route e é purpose 'commercial'
  const g = await gate(fx, EP_SALES_2);
  assertEquals(g.allowed, true);
  assertEquals(g.lineId, LINE);

  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  try {
    const h = makeDb(fx);
    const res = await resolveSalesWhatsappThread(h.db, {
      organizationId: ORG,
      contactId: CONTACT,
      endpointId: EP_SALES_2,
    });
    assertEquals(res.threadId, "t-rot");
    assertEquals(res.endpointRotated, true);
    assertEquals(h.fx.message_threads[0].primary_endpoint_id, EP_SALES_2);
    assertEquals(h.inserts.length, 0);
  } finally {
    console.log = orig;
  }
  assert(logs.some((l) => l.includes("SALES_THREAD_ENDPOINT_ROTATED")));
});

// ---------------------------------------------------------------- T9
Deno.test("T9 — flag OFF: nenhum reopen/rotação/criação canônica", async () => {
  const threads: Row[] = [{
    id: "t-off",
    organization_id: ORG,
    contact_id: CONTACT,
    channel: "whatsapp",
    business_context: "sales",
    merged_into_thread_id: null,
    status: "resolved",
    resolved_at: "2026-05-01T00:00:00Z",
    primary_endpoint_id: EP_SALES,
    created_at: "2026-01-01T00:00:00Z",
  }];
  const fx = baseFixture({ flagEnabled: false, threads });

  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  let called = false;
  try {
    const h = makeDb(fx);
    const g = await salesCanonicalPathEnabled(h.db, {
      organizationId: ORG,
      endpointId: EP_SALES_2,
    });
    // Simula o webhook: só chama o helper canônico se o gate liberar.
    if (g.allowed) {
      called = true;
      await resolveSalesWhatsappThread(h.db, {
        organizationId: ORG,
        contactId: CONTACT,
        endpointId: EP_SALES_2,
      });
    }
    assertEquals(g.allowed, false);
    assertEquals(h.updates.length, 0);
    assertEquals(h.inserts.length, 0);
  } finally {
    console.log = orig;
  }
  assertEquals(called, false);
  assertEquals(threads[0].status, "resolved");
  assertEquals(threads[0].primary_endpoint_id, EP_SALES);
  assert(!logs.some((l) => l.includes("SALES_THREAD_REOPENED")));
  assert(!logs.some((l) => l.includes("SALES_THREAD_ENDPOINT_ROTATED")));
  assert(!logs.some((l) => l.includes("canonical_thread_created")));
});

// ---------------------------------------------------------------- T10
Deno.test("T10 — Atendimento reprovado no gate nos três providers (flag ON ou OFF)", async () => {
  for (const flagEnabled of [true, false]) {
    for (const ep of [EP_CS, EP_NULL]) {
      const fx = baseFixture({ flagEnabled, flagOrgs: [] });
      const h = makeDb(fx);
      const g = await salesCanonicalPathEnabled(h.db, { organizationId: ORG, endpointId: ep });
      assertEquals(g.allowed, false);
      assertEquals(g.reason, "not_sales_endpoint");
      // gate não escreve nada
      assertEquals(h.updates.length, 0);
      assertEquals(h.inserts.length, 0);
    }
  }
  // input incompleto (org/endpoint ausentes) também cai no legado
  const h = makeDb(baseFixture({ flagEnabled: true }));
  assertEquals((await salesCanonicalPathEnabled(h.db, { organizationId: null, endpointId: EP_SALES })).reason, "missing_input");
  assertEquals((await salesCanonicalPathEnabled(h.db, { organizationId: ORG, endpointId: null })).reason, "missing_input");
});

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  claimLogRow,
  findSentDuplicate,
  IN_FLIGHT_MS,
  isRealSentRow,
  isTestSend,
  resolveTestEventCode,
  type LogRow,
  resolveEventId,
} from "./dedup.ts";

const ORG = "11111111-1111-1111-1111-111111111111";
const C1 = "c0000000-0000-0000-0000-000000000001";
const O1 = "00000000-0000-0000-0000-0000000000a1";

// Fake mínimo do admin p/ capi_event_log, com o índice único (organization_id, event_id)
// e o trigger de updated_at que existem em prod.
function fakeLogDb(seed: LogRow[] = []) {
  const rows: LogRow[] = seed.map((r) => ({ updated_at: "2026-01-01T00:00:00.000Z", ...r }));
  let seq = 0;
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 0, 2) + ++tick).toISOString();
  const admin = {
    rows,
    from: (_t: string) => {
      const filters: ((r: LogRow) => boolean)[] = [];
      let mode: "select" | "insert" | "update" = "select";
      let payload: LogRow = {};
      let lim = Infinity;
      const matched = () => rows.filter((r) => filters.every((f) => f(r))).slice(0, lim);
      const run = () => {
        if (mode === "insert") {
          if (rows.some((r) => r.organization_id === payload.organization_id && r.event_id === payload.event_id)) {
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
          const row = { id: `log-${++seq}`, updated_at: stamp(), ...payload };
          rows.push(row);
          return { data: [row], error: null };
        }
        if (mode === "update") {
          const m = matched();
          for (const r of m) Object.assign(r, payload, { updated_at: stamp() });
          return { data: m, error: null };
        }
        return { data: matched(), error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q,
        insert: (p: LogRow) => { mode = "insert"; payload = p; return q; },
        update: (p: LogRow) => { mode = "update"; payload = p; return q; },
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
        is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
        limit: (n: number) => { lim = n; return q; },
        single: () => { const r = run(); return Promise.resolve(r.error ? r : { data: r.data?.[0] ?? null, error: null }); },
        maybeSingle: () => { const r = run(); return Promise.resolve(r.error ? r : { data: r.data?.[0] ?? null, error: null }); },
        then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
      };
      return q;
    },
  };
  return admin;
}

// Espelha o fluxo de index.ts (resolve id → guard → claim → "Meta" → marca status).
async function send(
  admin: ReturnType<typeof fakeLogDb>,
  body: { event_name: string; contact_id?: string; opportunity_id?: string; test?: boolean; capi_event_log_id?: string },
  opts: { testEventCode?: string | null; metaOk?: boolean; eventTime?: number } = {},
) {
  let logRow: LogRow | null = null;
  let { event_name, contact_id, opportunity_id } = body;
  if (body.capi_event_log_id) {
    logRow = admin.rows.find((r) => r.id === body.capi_event_log_id) ?? null;
    event_name = logRow!.event_name; contact_id = logRow!.contact_id; opportunity_id = logRow!.opportunity_id;
  }
  const eventTime = opts.eventTime ?? Math.floor(Date.now() / 1000);
  const isTest = isTestSend(body.test, opts.testEventCode);
  const { eventId, dedup } = resolveEventId({
    logRow, organizationId: ORG, eventName: event_name, contactId: contact_id, opportunityId: opportunity_id, isTest, eventTime,
  });
  if (dedup) {
    if (logRow && isRealSentRow(logRow)) return { skipped: "duplicate", id: logRow.id, eventId, metaCalled: false };
    const dup = await findSentDuplicate(admin, {
      organizationId: ORG, eventName: event_name, eventId, contactId: contact_id, opportunityId: opportunity_id, excludeId: logRow?.id ?? null,
    });
    if (dup) {
      if (logRow) Object.assign(logRow, { status: "permanent_failure", next_retry_at: null });
      return { skipped: "duplicate", id: dup.id, eventId, metaCalled: false };
    }
  }
  const payload: LogRow = { data: [{ event_name, event_id: eventId }], access_token: "***" };
  if (opts.testEventCode) payload.test_event_code = opts.testEventCode;
  const baseLog = {
    organization_id: ORG, event_id: eventId, event_name, contact_id: contact_id ?? null,
    opportunity_id: opportunity_id ?? null, payload, test_event_code: opts.testEventCode ?? null,
  };
  let id: string;
  if (logRow) {
    Object.assign(logRow, baseLog, { status: "pending", attempt_count: (logRow.attempt_count || 0) + 1 });
    id = logRow.id;
  } else {
    const claim = await claimLogRow(admin, baseLog);
    if (claim.kind === "skip") return { skipped: claim.reason, id: claim.id, eventId, metaCalled: false };
    id = claim.id;
  }
  const row = admin.rows.find((r) => r.id === id)!;
  row.status = opts.metaOk === false ? "failed" : "sent";
  return { success: true, id, eventId, metaCalled: true };
}

Deno.test("primeiro Lead envia com event_id determinístico", async () => {
  const db = fakeLogDb();
  const r = await send(db, { event_name: "Lead", contact_id: C1 });
  assertEquals(r.metaCalled, true);
  assertEquals(r.eventId, `${ORG}:Lead:${C1}`);
  assertEquals(db.rows.length, 1);
});

Deno.test("segundo Lead do mesmo contato → skipped duplicate, sem Meta e sem nova linha", async () => {
  const db = fakeLogDb();
  const first = await send(db, { event_name: "Lead", contact_id: C1 });
  const second = await send(db, { event_name: "Lead", contact_id: C1 });
  assertEquals(second.skipped, "duplicate");
  assertEquals(second.metaCalled, false);
  assertEquals(second.id, first.id);
  assertEquals(db.rows.length, 1);
});

Deno.test("Lead legado (event_id com timestamp) já enviado bloqueia reenvio do mesmo contato", async () => {
  const db = fakeLogDb([{
    id: "legacy", organization_id: ORG, event_id: `${ORG}:Lead:${C1}:x:1700000000`, event_name: "Lead",
    contact_id: C1, status: "sent", test_event_code: null, payload: {},
  }]);
  const r = await send(db, { event_name: "Lead", contact_id: C1 });
  assertEquals(r.skipped, "duplicate");
  assertEquals(r.id, "legacy");
  assertEquals(db.rows.length, 1);
});

Deno.test("evento de teste (body.test) nunca é bloqueado e mantém id único", async () => {
  const db = fakeLogDb();
  await send(db, { event_name: "Lead", contact_id: C1 });
  const t1 = await send(db, { event_name: "Lead", contact_id: C1, test: true }, { eventTime: 1 });
  const t2 = await send(db, { event_name: "Lead", test: true }, { eventTime: 2 });
  assertEquals(t1.metaCalled, true);
  assertEquals(t2.metaCalled, true);
  assert(t1.eventId !== `${ORG}:Lead:${C1}`);
  assertEquals(db.rows.length, 3);
});

Deno.test("org com test_event_code: envia sempre (teste), sem dedup", async () => {
  const db = fakeLogDb();
  const a = await send(db, { event_name: "Lead", contact_id: C1 }, { testEventCode: "TEST123", eventTime: 10 });
  const b = await send(db, { event_name: "Lead", contact_id: C1 }, { testEventCode: "TEST123", eventTime: 11 });
  assertEquals([a.metaCalled, b.metaCalled], [true, true]);
});

Deno.test("linha anterior com test_event_code NÃO bloqueia o envio real", async () => {
  const db = fakeLogDb();
  await send(db, { event_name: "Lead", contact_id: C1 }, { testEventCode: "TEST123" });
  const real = await send(db, { event_name: "Lead", contact_id: C1 });
  assertEquals(real.metaCalled, true);
  assertEquals(real.eventId, `${ORG}:Lead:${C1}`);
});

Deno.test("linha sent com test_event_code só no payload também não bloqueia", () => {
  assertEquals(isRealSentRow({ status: "sent", test_event_code: null, payload: { test_event_code: "T" } }), false);
  assertEquals(isRealSentRow({ status: "sent", test_event_code: null, payload: {} }), true);
  assertEquals(isRealSentRow({ status: "failed" }), false);
});

Deno.test("retry por capi_event_log_id reaproveita o event_id da linha", async () => {
  const db = fakeLogDb();
  const first = await send(db, { event_name: "Lead", contact_id: C1 }, { metaOk: false });
  const before = db.rows[0].event_id;
  const retry = await send(db, { event_name: "", capi_event_log_id: first.id });
  assertEquals(retry.metaCalled, true);
  assertEquals(retry.eventId, before);
  assertEquals(db.rows.length, 1);
  assertEquals(db.rows[0].status, "sent");
});

Deno.test("retry de linha legada failed cujo contato já tem Lead sent → skip e encerra o retry", async () => {
  const db = fakeLogDb([
    { id: "ok", organization_id: ORG, event_id: `${ORG}:Lead:${C1}:x:1`, event_name: "Lead", contact_id: C1, status: "sent", test_event_code: null, payload: {} },
    { id: "bad", organization_id: ORG, event_id: `${ORG}:Lead:${C1}:x:2`, event_name: "Lead", contact_id: C1, status: "failed", test_event_code: null, payload: {} },
  ]);
  const r = await send(db, { event_name: "", capi_event_log_id: "bad" });
  assertEquals(r.skipped, "duplicate");
  assertEquals(r.id, "ok");
  assertEquals(db.rows.find((x) => x.id === "bad")!.status, "permanent_failure");
});

Deno.test("reprocessar linha já sent (real) → skip", async () => {
  const db = fakeLogDb();
  const first = await send(db, { event_name: "Lead", contact_id: C1 });
  const r = await send(db, { event_name: "", capi_event_log_id: first.id });
  assertEquals(r.skipped, "duplicate");
});

Deno.test("Purchase dedup por oportunidade (contato opcional)", async () => {
  const db = fakeLogDb();
  const a = await send(db, { event_name: "Purchase", opportunity_id: O1, contact_id: C1 });
  const b = await send(db, { event_name: "Purchase", opportunity_id: O1 });
  assertEquals(a.eventId, `${ORG}:Purchase:${O1}`);
  assertEquals(b.skipped, "duplicate");
  // Lead do mesmo contato é outro evento de negócio → não bloqueado
  const lead = await send(db, { event_name: "Lead", contact_id: C1 });
  assertEquals(lead.metaCalled, true);
});

Deno.test("evento sem chave de negócio (PageView) mantém id legado e não deduplica", () => {
  const d = resolveEventId({ organizationId: ORG, eventName: "PageView", isTest: false, eventTime: 5 });
  assertEquals(d, { eventId: `${ORG}:PageView:x:x:5`, dedup: false });
});

// --- Corrida: dois disparos simultâneos (trigger INSERT + UPDATE do contato) ---
Deno.test("corrida: 2º INSERT bate no índice único com linha pending recente → in_flight", async () => {
  const db = fakeLogDb();
  const base = { organization_id: ORG, event_id: `${ORG}:Lead:${C1}`, event_name: "Lead", contact_id: C1, payload: {} };
  const a = await claimLogRow(db, base);
  const b = await claimLogRow(db, base);
  assertEquals(a.kind, "claimed");
  assertEquals(b, { kind: "skip", reason: "in_flight", id: (a as { id: string }).id });
  assertEquals(db.rows.length, 1);
});

Deno.test("conflito com linha failed → assume a linha (attempt+1), sem nova linha", async () => {
  const db = fakeLogDb([{ id: "f", organization_id: ORG, event_id: `${ORG}:Lead:${C1}`, event_name: "Lead", status: "failed", attempt_count: 2, payload: {} }]);
  const r = await claimLogRow(db, { organization_id: ORG, event_id: `${ORG}:Lead:${C1}`, event_name: "Lead", payload: {} });
  assertEquals(r, { kind: "claimed", id: "f", attemptCount: 3 });
  assertEquals(db.rows.length, 1);
  assertEquals(db.rows[0].status, "pending");
});

Deno.test("conflito com pending velho (crash) → assume; dois takeovers concorrentes → só um ganha", async () => {
  const old = new Date(Date.now() - IN_FLIGHT_MS - 1000).toISOString();
  const db = fakeLogDb([{ id: "p", organization_id: ORG, event_id: "E", event_name: "Lead", status: "pending", attempt_count: 1, last_attempt_at: old, payload: {} }]);
  const base = { organization_id: ORG, event_id: "E", event_name: "Lead", payload: {} };
  const [a, b] = await Promise.all([claimLogRow(db, base), claimLogRow(db, base)]);
  const kinds = [a.kind, b.kind].sort();
  assertEquals(kinds, ["claimed", "skip"]);
});

Deno.test("conflito com linha sent real → duplicate", async () => {
  const db = fakeLogDb([{ id: "s", organization_id: ORG, event_id: "E", event_name: "Lead", status: "sent", test_event_code: null, payload: {} }]);
  const r = await claimLogRow(db, { organization_id: ORG, event_id: "E", event_name: "Lead", payload: {} });
  assertEquals(r, { kind: "skip", reason: "duplicate", id: "s" });
});

Deno.test("código de teste: vale só em envio de teste e nunca vira evento real no reenvio", () => {
  const base = { savedCode: null };
  assertEquals(resolveTestEventCode({ ...base, bodyTest: true, bodyCode: " TEST123 " }), "TEST123");
  // Evento normal ignora código vindo no body.
  assertEquals(resolveTestEventCode({ ...base, bodyTest: undefined, bodyCode: "TEST123" }), null);
  // Formato inválido é descartado.
  assertEquals(resolveTestEventCode({ ...base, bodyTest: true, bodyCode: "a b;c" }), null);
  // Código salvo na org segue valendo (comportamento anterior).
  assertEquals(resolveTestEventCode({ bodyTest: undefined, bodyCode: undefined, savedCode: "SALVO" }), "SALVO");
  // Reenvio de linha de teste mantém o código da linha.
  assertEquals(resolveTestEventCode({ bodyTest: undefined, bodyCode: undefined, savedCode: null, logRowCode: "TEST9" }), "TEST9");
});

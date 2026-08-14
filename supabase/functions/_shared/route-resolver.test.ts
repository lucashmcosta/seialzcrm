import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveSalesReplyRoute } from "./route-resolver.ts";

// ---------------------------------------------------------------------------
// Fake DB: builder chainable que devolve o fixture da tabela.
// ---------------------------------------------------------------------------
type Fixture = Record<string, { data: unknown; error?: unknown }>;

function fakeDb(fx: Fixture) {
  const calls: string[] = [];
  const make = (table: string) => {
    const res = fx[table] ?? { data: null };
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      not: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve({ data: res.data ?? null, error: res.error ?? null }),
      then: (r: any) => Promise.resolve({ data: res.data ?? null, error: res.error ?? null }).then(r),
    };
    return builder;
  };
  return {
    calls,
    from: (table: string) => {
      calls.push(table);
      return make(table);
    },
  };
}

const ORG = "org-1";
const THREAD = "thread-1";
const HIST_EP = "ep-hist";
const ACTIVE_EP = "ep-active";
const LINE = "line-1";

const flagOn = { data: { is_enabled: true, organization_ids: [ORG] } };
const flagOff = { data: { is_enabled: false, organization_ids: [] } };
const salesThread = { data: { organization_id: ORG, business_context: "sales", channel: "whatsapp" } };
const csThread = { data: { organization_id: ORG, business_context: "customer_service", channel: "whatsapp" } };

Deno.test("R1 flag OFF → não aplicável, caminho legado", async () => {
  const db = fakeDb({ message_threads: salesThread, feature_flags: flagOff });
  const r = await resolveSalesReplyRoute(db, { threadId: THREAD });
  assertEquals(r.applicable, false);
  assertEquals(r.reason, "flag_off");
});

Deno.test("R2 Atendimento nunca entra no caminho canônico", async () => {
  const db = fakeDb({ message_threads: csThread, feature_flags: flagOn });
  const r = await resolveSalesReplyRoute(db, { threadId: THREAD });
  assertEquals(r.reason, "not_sales_context");
  assertEquals(db.calls.includes("feature_flags"), false);
});

Deno.test("R3 sales + flag ON → responde pelo endpoint da última mensagem válida", async () => {
  const db = fakeDb({
    message_threads: salesThread,
    feature_flags: flagOn,
    messages: { data: { endpoint_id: HIST_EP } },
    messaging_line_endpoints: { data: [{ line_id: LINE }] },
    messaging_lines: { data: [{ id: LINE, route_slug: "commercial", active_endpoint_id: ACTIVE_EP }] },
    communication_endpoints: {
      data: { id: ACTIVE_EP, is_active: true, provider: "meta_cloud_api", organization_id: ORG, channel: "whatsapp" },
    },
  });
  const r = await resolveSalesReplyRoute(db, { threadId: THREAD });
  assertEquals(r.applicable, true);
  assertEquals(r.reason, "resolved_by_last_message");
  assertEquals(r.sendEndpointId, HIST_EP);
  assertEquals(r.choice, "derived");
  assertEquals(r.provider, "meta_cloud_api");
  assertEquals(r.discoveredByEndpointId, HIST_EP);
  assertEquals(r.lineId, LINE);
});

Deno.test("R4 conversa sem mensagem roteável e sem Route default → UNRESOLVED", async () => {
  const db = fakeDb({
    message_threads: salesThread,
    feature_flags: flagOn,
    messages: { data: null },
  });
  const r = await resolveSalesReplyRoute(db, { threadId: THREAD });
  assertEquals(r.applicable, false);
  assertEquals(r.reason, "REPLY_ROUTE_UNRESOLVED");
  assertEquals(r.sendEndpointId, null);
});

Deno.test("R5 endpoint histórico sem link ativo de Route → UNRESOLVED", async () => {
  const db = fakeDb({
    message_threads: salesThread,
    feature_flags: flagOn,
    messages: { data: { endpoint_id: HIST_EP } },
    messaging_line_endpoints: { data: [] },
  });
  const r = await resolveSalesReplyRoute(db, { threadId: THREAD });
  assertEquals(r.reason, "REPLY_ROUTE_UNRESOLVED");
  assertEquals(r.discoveredByEndpointId, HIST_EP);
});

Deno.test("R6 Route sem active_endpoint_id ainda responde pela última mensagem", async () => {
  const db = fakeDb({
    message_threads: salesThread,
    feature_flags: flagOn,
    messages: { data: { endpoint_id: HIST_EP } },
    messaging_line_endpoints: { data: [{ line_id: LINE }] },
    messaging_lines: { data: [{ id: LINE, route_slug: "commercial", active_endpoint_id: null }] },
    communication_endpoints: {
      data: { id: HIST_EP, is_active: true, provider: "meta_cloud_api", organization_id: ORG, channel: "whatsapp" },
    },
  });
  const r = await resolveSalesReplyRoute(db, { threadId: THREAD });
  assertEquals(r.applicable, true);
  assertEquals(r.reason, "resolved_by_last_message");
  assertEquals(r.sendEndpointId, HIST_EP);
});

Deno.test("R7 endpoint ativo inativo/tecnicamente inapto → UNRESOLVED", async () => {
  const db = fakeDb({
    message_threads: salesThread,
    feature_flags: flagOn,
    messages: { data: { endpoint_id: HIST_EP } },
    messaging_line_endpoints: { data: [{ line_id: LINE }] },
    messaging_lines: { data: [{ id: LINE, route_slug: "commercial", active_endpoint_id: ACTIVE_EP }] },
    communication_endpoints: {
      data: { id: ACTIVE_EP, is_active: false, provider: "meta_cloud_api", organization_id: ORG, channel: "whatsapp" },
    },
  });
  const r = await resolveSalesReplyRoute(db, { threadId: THREAD });
  assertEquals(r.reason, "REPLY_ROUTE_UNRESOLVED");
});

Deno.test("R8 endpoint ativo de outra organização → UNRESOLVED", async () => {
  const db = fakeDb({
    message_threads: salesThread,
    feature_flags: flagOn,
    messages: { data: { endpoint_id: HIST_EP } },
    messaging_line_endpoints: { data: [{ line_id: LINE }] },
    messaging_lines: { data: [{ id: LINE, route_slug: "commercial", active_endpoint_id: ACTIVE_EP }] },
    communication_endpoints: {
      data: { id: ACTIVE_EP, is_active: true, provider: "meta_cloud_api", organization_id: "other-org", channel: "whatsapp" },
    },
  });
  const r = await resolveSalesReplyRoute(db, { threadId: THREAD });
  assertEquals(r.reason, "REPLY_ROUTE_UNRESOLVED");
});

Deno.test("R9 flag global (organization_ids vazio) habilita a org", async () => {
  const db = fakeDb({
    message_threads: salesThread,
    feature_flags: { data: { is_enabled: true, organization_ids: [] } },
    messages: { data: { endpoint_id: HIST_EP } },
    messaging_line_endpoints: { data: [{ line_id: LINE }] },
    messaging_lines: { data: [{ id: LINE, route_slug: "commercial", active_endpoint_id: ACTIVE_EP }] },
    communication_endpoints: {
      data: { id: ACTIVE_EP, is_active: true, provider: "evolution_api", organization_id: ORG, channel: "whatsapp" },
    },
  });
  const r = await resolveSalesReplyRoute(db, { threadId: THREAD });
  assertEquals(r.applicable, true);
  assertEquals(r.provider, "evolution_api");
});

Deno.test("R10 sem threadId → missing_input (legado)", async () => {
  const db = fakeDb({});
  const r = await resolveSalesReplyRoute(db, { threadId: null });
  assertEquals(r.reason, "missing_input");
});

Deno.test("R11 conversa SEM mensagem válida → default legado da Route (route_default)", async () => {
  const db = fakeDb({
    message_threads: salesThread,
    feature_flags: flagOn,
    messages: { data: null },
    messaging_lines: { data: [{ id: LINE, route_slug: "commercial", active_endpoint_id: ACTIVE_EP }] },
    communication_endpoints: {
      data: { id: ACTIVE_EP, is_active: true, provider: "meta_cloud_api", organization_id: ORG, channel: "whatsapp" },
    },
  });
  const r = await resolveSalesReplyRoute(db, { threadId: THREAD });
  assertEquals(r.applicable, true);
  assertEquals(r.reason, "resolved_by_route_default");
  assertEquals(r.sendEndpointId, ACTIVE_EP);
  assertEquals(r.choice, "route_default");
  assertEquals(r.discoveredByEndpointId, null);
});

Deno.test("R12 outbound é fonte válida da seleção derivada", async () => {
  const db = fakeDb({
    message_threads: salesThread,
    feature_flags: flagOn,
    // fake DB não filtra direção: prova que o resolver aceita a última mensagem
    // qualquer que seja a direção (inbound OU outbound).
    messages: { data: { endpoint_id: HIST_EP, direction: "outbound" } },
    messaging_line_endpoints: { data: [{ line_id: LINE }] },
    messaging_lines: { data: [{ id: LINE, route_slug: "commercial", active_endpoint_id: ACTIVE_EP }] },
    communication_endpoints: {
      data: { id: HIST_EP, is_active: true, provider: "meta_cloud_api", organization_id: ORG, channel: "whatsapp" },
    },
  });
  const r = await resolveSalesReplyRoute(db, { threadId: THREAD });
  assertEquals(r.sendEndpointId, HIST_EP);
  assertEquals(r.reason, "resolved_by_last_message");
});

import { assertEquals } from "jsr:@std/assert@1";
import { handleSignatureWhatsApp, matchesSigningRecipient } from "./signature-whatsapp.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const definition = [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Assine seu documento." }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Assinar", url: "https://sign.suvsign.com/s/{{1}}" }] }];

// Banco em memória que aplica os filtros das consultas e a trava UNIQUE.
function fixture() {
  const rows: Record<string, any[]> = {
    signature_request_participants: [{ id: id(2), request_id: id(1), organization_id: id(3), name: "Ana", email: "ana@example.test", phone: "+5511999990000", status: "invited", signing_mode: "manual", provider_participant_id: id(20) }],
    communication_endpoints: [{ id: id(4), organization_id: id(3), organization_integration_id: id(5), purpose: "commercial", status: "online", provider: "meta_cloud_api", channel: "whatsapp", is_active: true }],
    contacts: [{ id: id(6), organization_id: id(3), email: "ana@example.test", phone: "+5511999990000" }],
    whatsapp_templates: [{ id: id(7), organization_id: id(3), organization_integration_id: id(5), provider: "meta_cloud_api", status: "approved", is_active: true, allowed_purposes: ["commercial"], components: definition }],
    signature_whatsapp_settings: [{ organization_id: id(3), organization_integration_id: id(5), template_id: id(7), header_image_url: "https://suvsign.com/og-sign.jpg", updated_at: "v1" }],
    signature_whatsapp_deliveries: [],
    messages: [],
  };
  let permitted = true;
  const db = {
    rpc: () => Promise.resolve({ data: permitted, error: null }),
    from: (table: string) => {
      let filters: ((r: any) => boolean)[] = [], operation = "read", value: any, maximum = Infinity;
      const q: any = {
        select: () => q,
        eq: (key: string, v: any) => { filters.push(r => key === "metadata->>signature_delivery_id" ? r.metadata?.signature_delivery_id === v : key === "message_threads.contact_id" ? r.message_threads?.contact_id === v : r[key] === v); return q; },
        ilike: (key: string, v: string) => { filters.push(r => String(r[key]).toLowerCase() === v.toLowerCase()); return q; },
        order: () => q, limit: (n: number) => { maximum = n; return q; },
        insert: (v: any) => { operation = "insert"; value = v; return q; },
        update: (v: any) => { operation = "update"; value = v; return q; },
        upsert: (v: any) => { operation = "upsert"; value = v; return q; },
        maybeSingle: async () => { const result = await q; return { ...result, data: result.data?.[0] ?? null }; },
        then: (resolve: any, reject: any) => Promise.resolve().then(() => {
          const matches = (rows[table] ?? []).filter(r => filters.every(f => f(r))).slice(0, maximum);
          if (operation === "insert") {
            if (rows[table].some(r => r.id === value.id || (r.participant_id === value.participant_id && ["pending", "unknown"].includes(r.status)))) return { data: null, error: { code: "23505" } };
            rows[table].push({ status: "pending", ...value });
          }
          if (operation === "update") matches.forEach(r => Object.assign(r, value));
          if (operation === "upsert") rows[table] = [value];
          return { data: matches, error: null };
        }).then(resolve, reject),
      };
      return q;
    },
  };
  const request = { id: id(1), organization_id: id(3), provider_operation_id: id(30), status: "sent", contact_id: id(6) };
  let calls = 0, lastPayload: any = null;
  const ctx = {
    admin: db, userDb: db, me: { id: id(9), full_name: "Operador" },
    loadRequest: async (requestId: unknown) => requestId === request.id ? request : null,
    canManage: async () => permitted,
    getLink: async () => new Response(JSON.stringify({ signing_url: "https://sign.suvsign.com/s/private_test_token" })),
    json: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status }),
    dispatch: async (payload: any) => { calls++; lastPayload = payload; return { data: { success: true, messageId: id(12), threadId: id(13) }, error: null }; },
  };
  const body = { request_id: id(1), participant_id: id(2), endpoint_id: id(4), contact_id: id(6), delivery_id: id(8), settings_updated_at: "v1" };
  return { rows, request, ctx, body, calls: () => calls, payload: () => lastPayload, deny: () => { permitted = false; } };
}

Deno.test("envio usa conta e participante corretos, mantém link só em memória e deduplica retry", async () => {
  const f = fixture();
  assertEquals((await handleSignatureWhatsApp("send_whatsapp_link", f.body, f.ctx)).status, 200);
  assertEquals(f.payload().endpointId, id(4));
  assertEquals(f.payload().templateButtonUrls[0], "https://sign.suvsign.com/s/private_test_token");
  assertEquals(f.payload().sensitiveTemplate, true);
  assertEquals(JSON.stringify(f.rows).includes("private_test_token"), false);
  assertEquals((await handleSignatureWhatsApp("send_whatsapp_link", f.body, f.ctx)).status, 200);
  assertEquals(f.calls(), 1);
});
Deno.test("envios concorrentes: só uma chamada chega ao provider", async () => {
  const f = fixture();
  const responses = await Promise.all([handleSignatureWhatsApp("send_whatsapp_link", f.body, f.ctx), handleSignatureWhatsApp("send_whatsapp_link", { ...f.body, delivery_id: id(19) }, f.ctx)]);
  assertEquals(f.calls(), 1);
  assertEquals(responses.map(r => r.status).sort(), [200, 409]);
});
Deno.test("recusa outra organização, WABA e contato sem chamar o provider", async () => {
  for (const target of ["communication_endpoints", "contacts", "whatsapp_templates", "signature_request_participants"]) {
    const f = fixture(); f.rows[target][0].organization_id = id(90);
    assertEquals((await handleSignatureWhatsApp("send_whatsapp_link", f.body, f.ctx)).ok, false);
    assertEquals(f.calls(), 0);
  }
  const f = fixture(); f.rows.whatsapp_templates[0].organization_integration_id = id(90);
  assertEquals((await handleSignatureWhatsApp("send_whatsapp_link", f.body, f.ctx)).ok, false);
  assertEquals(f.calls(), 0);
});
Deno.test("RLS da solicitação e permissão de número são obrigatórias", async () => {
  const f = fixture();
  assertEquals((await handleSignatureWhatsApp("send_whatsapp_link", { ...f.body, request_id: id(90) }, f.ctx)).status, 404);
  f.deny();
  assertEquals((await handleSignatureWhatsApp("send_whatsapp_link", f.body, f.ctx)).status, 403);
  assertEquals(f.calls(), 0);
});
Deno.test("bloqueia assinados, automáticos, cancelados, telefone trocado e configuração antiga", async () => {
  const cases = [
    (f: ReturnType<typeof fixture>) => { f.rows.signature_request_participants[0].status = "signed"; },
    (f: ReturnType<typeof fixture>) => { f.rows.signature_request_participants[0].signing_mode = "automatic"; },
    (f: ReturnType<typeof fixture>) => { f.request.status = "cancelled"; },
    (f: ReturnType<typeof fixture>) => { f.rows.contacts[0].phone = "+5511888880000"; },
    (f: ReturnType<typeof fixture>) => { f.body.settings_updated_at = "old"; },
  ];
  for (const change of cases) { const f = fixture(); change(f); assertEquals((await handleSignatureWhatsApp("send_whatsapp_link", f.body, f.ctx)).ok, false); assertEquals(f.calls(), 0); }
});
Deno.test("timeout mantém trava e exige conferência, sem retry automático", async () => {
  const f = fixture();
  f.ctx.dispatch = async () => { throw new Error("timeout"); };
  assertEquals((await handleSignatureWhatsApp("send_whatsapp_link", f.body, f.ctx)).status, 502);
  assertEquals(f.rows.signature_whatsapp_deliveries[0].status, "unknown");
  assertEquals((await handleSignatureWhatsApp("send_whatsapp_link", { ...f.body, delivery_id: id(19) }, f.ctx)).status, 409);
});
Deno.test("reenvio exige reconhecimento do envio anterior", async () => {
  const f = fixture();
  await handleSignatureWhatsApp("send_whatsapp_link", f.body, f.ctx);
  assertEquals((await handleSignatureWhatsApp("send_whatsapp_link", { ...f.body, delivery_id: id(19) }, f.ctx)).status, 409);
  assertEquals((await handleSignatureWhatsApp("send_whatsapp_link", { ...f.body, delivery_id: id(19), resend_of: id(8) }, f.ctx)).status, 200);
  assertEquals(f.calls(), 2);
});
Deno.test("sem telefone do snapshot só vincula e-mail exato; nome não basta", () => {
  assertEquals(matchesSigningRecipient({ email: "ANA@example.test" }, { email: "ana@example.test", phone: "+5511999990000" }), true);
  assertEquals(matchesSigningRecipient({ name: "Ana", email: "ana@example.test" }, { name: "Ana", email: "outra@example.test", phone: "+5511999990000" }), false);
});

Deno.test("configuração não aceita template de outra conta nem usuário sem permissão", async () => {
  const f = fixture();
  const input = { ...f.body, template_id: id(7), header_image_url: "https://suvsign.com/og-sign.jpg" };
  assertEquals((await handleSignatureWhatsApp("save_whatsapp_settings", input, f.ctx)).status, 200);
  f.rows.whatsapp_templates[0].organization_integration_id = id(90);
  assertEquals((await handleSignatureWhatsApp("save_whatsapp_settings", input, f.ctx)).status, 409);
  f.deny();
  assertEquals((await handleSignatureWhatsApp("save_whatsapp_settings", input, f.ctx)).status, 403);
});
Deno.test("prévia não busca link privado nem envia mensagem", async () => {
  const f = fixture();
  f.ctx.getLink = async () => { throw new Error("Link solicitado na prévia"); };
  const result = await (await handleSignatureWhatsApp("get_whatsapp_context", f.body, f.ctx)).json();
  assertEquals(result.contacts.length, 1);
  assertEquals(result.endpoints.length, 1);
  assertEquals(f.calls(), 0);
  f.rows.contacts[0].phone = "+5511888880000";
  const withoutMatch = await (await handleSignatureWhatsApp("get_whatsapp_context", f.body, f.ctx)).json();
  assertEquals(withoutMatch.contacts.length, 0);
});
Deno.test("segunda busca de link lenta não duplica mensagem já concluída", async () => {
  const f = fixture();
  let resolveLink!: () => void;
  const wait = new Promise<void>(resolve => { resolveLink = resolve; });
  const originalLink = f.ctx.getLink;
  let linkCalls = 0;
  f.ctx.getLink = async () => { linkCalls++; if (linkCalls === 2) await wait; return originalLink(); };
  const first = handleSignatureWhatsApp("send_whatsapp_link", f.body, f.ctx);
  const second = handleSignatureWhatsApp("send_whatsapp_link", { ...f.body, delivery_id: id(19) }, f.ctx);
  await first; resolveLink();
  assertEquals((await second).status, 409);
  assertEquals(f.calls(), 1);
});

Deno.test("timeout é reconciliado somente com mensagem terminal da mesma organização, contato e número", async () => {
  const f = fixture();
  f.rows.signature_whatsapp_deliveries.push({ id: id(8), organization_id: id(3), participant_id: id(2), contact_id: id(6), endpoint_id: id(4), status: "unknown" });
  f.rows.messages.push({ id: id(12), thread_id: id(13), organization_id: id(90), endpoint_id: id(4), whatsapp_status: "delivered", metadata: { signature_delivery_id: id(8) }, message_threads: { contact_id: id(6) } });
  await handleSignatureWhatsApp("get_whatsapp_context", f.body, f.ctx);
  assertEquals(f.rows.signature_whatsapp_deliveries[0].status, "unknown");
  f.rows.messages[0].organization_id = id(3);
  const response = await (await handleSignatureWhatsApp("get_whatsapp_context", f.body, f.ctx)).json();
  assertEquals(response.last_delivery.status, "sent");
  assertEquals(response.last_sent.id, id(8));
  assertEquals(f.calls(), 0);
});

import { assert, assertEquals } from "jsr:@std/assert@1";
import { allowedThreadIds, buildPreview, validatePreviewInput, verifySignature, hmacSha256Hex, type MessageRow } from "./logic.ts";

const SECRET = "test-secret";
const BODY = '{"seialz_contact_ids":["11111111-1111-1111-1111-111111111111"]}';
const NOW = 1_800_000_000;
const sig = async (ts: number) => "sha256=" + (await hmacSha256Hex(SECRET, `${ts}.${BODY}`));

Deno.test("assinatura válida", async () => {
  assert(await verifySignature({ secret: SECRET, timestampHeader: String(NOW), signatureHeader: await sig(NOW), rawBody: BODY, nowSeconds: NOW }));
});
Deno.test("assinatura inválida", async () => {
  assert(!(await verifySignature({ secret: SECRET, timestampHeader: String(NOW), signatureHeader: "sha256=" + "0".repeat(64), rawBody: BODY, nowSeconds: NOW })));
});
Deno.test("assinatura expirada (>300s)", async () => {
  const ts = NOW - 301;
  assert(!(await verifySignature({ secret: SECRET, timestampHeader: String(ts), signatureHeader: await sig(ts), rawBody: BODY, nowSeconds: NOW })));
});

const U = "11111111-1111-1111-1111-111111111111";
Deno.test("validação de entrada", () => {
  assertEquals(validatePreviewInput({ seialz_contact_ids: [U] })?.limit, 20);
  assertEquals(validatePreviewInput({ seialz_contact_ids: [U], limit: 30 })?.limit, 30);
  assertEquals(validatePreviewInput({ seialz_contact_ids: [] }), null);
  assertEquals(validatePreviewInput({ seialz_contact_ids: Array(6).fill(U) }), null);
  assertEquals(validatePreviewInput({ seialz_contact_ids: ["x"] }), null);
  assertEquals(validatePreviewInput({ seialz_contact_ids: [U], limit: 0 }), null);
  assertEquals(validatePreviewInput({ seialz_contact_ids: [U], limit: 31 }), null);
  assertEquals(validatePreviewInput({ seialz_contact_ids: [U], limit: 2.5 }), null);
  assertEquals(validatePreviewInput(null), null);
});

const EP = "c09bd713-0225-4533-afe8-20ac07bd3a7c";
const base = (o: Partial<MessageRow>): MessageRow => ({
  id: "m", thread_id: "t1", direction: "inbound", content: "oi", media_type: null,
  created_at: "2026-10-30T10:00:00Z", sender_type: "contact", sender_user_id: null,
  is_internal_note: false, deleted_at: null, media_urls: ["https://x/secret.jpg"], ...o,
});

Deno.test("filtros e projeção", () => {
  const threads = allowedThreadIds([
    { id: "t1", channel: "whatsapp", primary_endpoint_id: EP },
    { id: "t2", channel: "whatsapp", primary_endpoint_id: "outro" },
  ], EP);
  assertEquals(threads, ["t1"]);
  const msgs = [
    base({ id: "ok-in", created_at: "2026-10-30T10:00:00Z" }),
    base({ id: "ok-out", direction: "outbound", sender_type: "user", sender_user_id: "u1", created_at: "2026-10-30T11:00:00Z" }),
    base({ id: "ok-ai", direction: "outbound", sender_type: "agent", content: "", media_type: "image", created_at: "2026-10-30T12:00:00Z" }),
    base({ id: "note", is_internal_note: true }),
    base({ id: "internal", direction: "internal" }),
    base({ id: "system", direction: "outbound", sender_type: "system" }),
    base({ id: "deleted", deleted_at: "2026-10-30T10:05:00Z" }),
    base({ id: "other-ep", thread_id: "t2" }),
  ];
  const out = buildPreview(msgs, threads, new Map([["u1", "Bruna Silva"]]), 20);
  assertEquals(out.map((m) => m.id), ["ok-ai", "ok-out", "ok-in"]);
  assertEquals(out[0], { id: "ok-ai", direction: "outbound", body: null, media_type: "image", created_at: "2026-10-30T12:00:00Z", sender_label: "Equipe Central" });
  assertEquals(out[1].sender_label, "Bruna");
  assertEquals(out[2].sender_label, null);
  const s = JSON.stringify(out);
  assert(!s.includes("media_urls") && !s.includes("https://"));
  assertEquals(buildPreview(msgs, threads, new Map(), 1).length, 1);
});

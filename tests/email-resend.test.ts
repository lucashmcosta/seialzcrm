import { assert, assertEquals } from "jsr:@std/assert";
import { bodyToHtml, fillText, renderEmail, verifySvixSignature } from "../supabase/functions/_shared/email-resend.ts";

const ctx = {
  contact: { full_name: "Ana Paula Lima" }, opportunity: { title: "Visto" }, owner: { full_name: "Bruno Reis" },
  org: { name: "Empresa X" }, custom: { trilha: "L-1" },
};

Deno.test("preenche marcadores no texto e aponta os vazios", () => {
  assertEquals(fillText("Oi {{contact.first_name}}, trilha {{custom.trilha}}", ctx), { text: "Oi Ana, trilha L-1", missing: [] });
  assertEquals(fillText("Oi {{custom.nada}}", ctx).missing, ["custom.nada"]);
});

Deno.test("corpo vira HTML seguro: escapa tags, parágrafos e links", () => {
  const html = bodyToHtml("Olá <b>x</b>\nlinha 2\n\nVeja https://exemplo.com/a.");
  assert(html.includes("&lt;b&gt;x&lt;/b&gt;<br>linha 2"));
  assert(html.includes('<a href="https://exemplo.com/a"'));
  assertEquals((html.match(/<p /g) ?? []).length, 2);
});

Deno.test("moldura tem rodapé e descadastro só quando é marketing", () => {
  const mk = renderEmail({ body: "Oi", branding: { org_name: "Empresa X", footer_text: "Empresa X LTDA\nRua A, 1", brand_color: "#ff0000" }, unsubscribeUrl: "https://x/u?t=1" });
  assert(mk.html.includes("Não quero mais receber") && mk.html.includes("Rua A, 1") && mk.html.includes("#ff0000"));
  assert(mk.text.includes("https://x/u?t=1"));
  const op = renderEmail({ body: "Oi", branding: { org_name: "Empresa X", brand_color: "javascript:x" }, unsubscribeUrl: null });
  assert(!op.html.includes("Não quero mais receber") && op.html.includes("#111827"));
});

Deno.test("assinatura Svix: aceita a certa, recusa alterada e antiga", async () => {
  const secretBytes = new TextEncoder().encode("segredo-de-teste-1234567890");
  const secret = "whsec_" + btoa(String.fromCharCode(...secretBytes));
  const body = '{"type":"email.delivered"}';
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`msg_1.1700000000.${body}`)))));
  assert(await verifySvixSignature({ secret, id: "msg_1", timestamp: "1700000000", signature: `v1,${sig}`, body, nowSeconds: 1700000100 }));
  assert(!(await verifySvixSignature({ secret, id: "msg_1", timestamp: "1700000000", signature: `v1,${sig}`, body: body + " ", nowSeconds: 1700000100 })));
  assert(!(await verifySvixSignature({ secret, id: "msg_1", timestamp: "1700000000", signature: `v1,${sig}`, body, nowSeconds: 1700009999 })));
});

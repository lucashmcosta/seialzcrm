import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { buildMetaTemplateComponents, redactTemplateComponents, signatureTemplateButton, urlButtonSuffix, type TemplateDefinition } from "./meta-template-components.ts";

export const signingTemplate: TemplateDefinition[] = [
  { type: "HEADER", format: "IMAGE" },
  { type: "BODY", text: "Seu documento está pronto. Toque em *Assinar*." },
  { type: "BUTTONS", buttons: [{ type: "URL", text: "Assinar", url: "https://sign.suvsign.com/s/{{1}}" }] },
];
Deno.test("template de assinatura: imagem e sufixo exato no botão, sem variável no corpo", () => {
  const result = buildMetaTemplateComponents(signingTemplate, { headerImageUrl: "https://suvsign.com/og-sign.jpg", buttonUrls: { "0": "https://sign.suvsign.com/s/token_-123" } });
  assertEquals(result.components, [
    { type: "header", parameters: [{ type: "image", image: { link: "https://suvsign.com/og-sign.jpg" } }] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "token_-123" }] },
  ]);
  assertEquals(JSON.stringify(redactTemplateComponents(result.components)).includes("token_-123"), false);
});
Deno.test("template legado mantém body, ordem numérica, saneamento e prévia", () => {
  const result = buildMetaTemplateComponents([{ type: "BODY", text: "{{2}}, {{1}} / {{1}}" }], { body: { var1: "Ana\nSilva", "2": "Oi" } });
  assertEquals(result.preview, "Oi, Ana Silva / Ana Silva");
  assertEquals(result.components, [{ type: "body", parameters: [{ type: "text", text: "Ana Silva" }, { type: "text", text: "Oi" }] }]);
});
Deno.test("bloqueia domínio trocado, URL inteira errada e parâmetro ausente", () => {
  for (const link of ["http://sign.suvsign.com/s/token", "https://evil.test/s/token", "https://sign.suvsign.com.evil.test/s/token", "https://sign.suvsign.com/s/", "https://sign.suvsign.com/s/token#frag"]) {
    assertThrows(() => urlButtonSuffix("https://sign.suvsign.com/s/{{1}}", link));
  }
  assertThrows(() => buildMetaTemplateComponents(signingTemplate, { buttonUrls: { "0": "https://sign.suvsign.com/s/token" } }));
  assertThrows(() => buildMetaTemplateComponents(signingTemplate, { headerImageUrl: "https://suvsign.com/og-sign.jpg" }));
});
Deno.test("configuração aceita somente template integralmente mapeável", () => {
  assertEquals(signatureTemplateButton(signingTemplate)?.hasImage, true);
  assertEquals(signatureTemplateButton([{ type: "BODY", text: "Olá {{1}}" }, signingTemplate[2]]), null);
  assertEquals(signatureTemplateButton([{ type: "HEADER", format: "VIDEO" }, ...signingTemplate.slice(1)]), null);
  assertEquals(signatureTemplateButton([signingTemplate[1], { type: "BUTTONS", buttons: [{ type: "URL", text: "Assinar", url: "https://evil.test/{{1}}" }] }]), null);
});

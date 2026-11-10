import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  buildComponents,
  type CreateInput,
  fileNameFromUrl,
  guessMimeFromUrl,
  isAllowedSampleUrl,
  localTemplateType,
  validateSampleMedia,
  validateTemplateInput,
} from "../supabase/functions/meta-whatsapp-templates-create/components.ts";
import { buildMetaTemplateComponents, type TemplateDefinition } from "../supabase/functions/_shared/meta-template-components.ts";
import { templateDisplay } from "../supabase/functions/_shared/template-display.ts";

const base: CreateInput = { organizationId: "org1", name: "promo", language: "pt_BR", category: "MARKETING", body: "Oi" };

// ---------- Criação ----------
Deno.test("criação: botões mistos ficam com respostas rápidas primeiro, ordem relativa preservada", () => {
  const input: CreateInput = {
    ...base,
    buttons: [{ id: "a", title: "Sim" }, { id: "b", title: "Não" }],
    actions: [
      { type: "url", title: "Ver pedido", value: "https://loja.test/p/{{1}}", example: "123" },
      { type: "phone", title: "Ligar", value: "+55 (11) 99999-0000" },
      { type: "copy_code", title: "", value: "PROMO10" },
      { type: "url", title: "Site", value: "https://loja.test" },
    ],
  };
  assertEquals(validateTemplateInput(input), null);
  assertEquals(buildComponents(input), [
    { type: "BODY", text: "Oi" },
    {
      type: "BUTTONS",
      buttons: [
        { type: "QUICK_REPLY", text: "Sim" },
        { type: "QUICK_REPLY", text: "Não" },
        { type: "URL", text: "Ver pedido", url: "https://loja.test/p/{{1}}", example: ["https://loja.test/p/123"] },
        { type: "PHONE_NUMBER", text: "Ligar", phone_number: "5511999990000" },
        { type: "COPY_CODE", example: "PROMO10" },
        { type: "URL", text: "Site", url: "https://loja.test" },
      ],
    },
  ]);
  assertEquals(localTemplateType(input), "call-to-action");
});

Deno.test("criação: limites da Meta para botões", () => {
  const url = (n: number) => ({ type: "url" as const, title: `L${n}`, value: "https://x.test" });
  assertEquals(validateTemplateInput({ ...base, actions: [url(1), url(2), url(3)] }), "O template aceita no máximo 2 botões de link.");
  assertEquals(
    validateTemplateInput({ ...base, actions: [{ type: "phone", title: "a", value: "5511999990000" }, { type: "phone", title: "b", value: "5511999990001" }] }),
    "O template aceita no máximo 1 botão de telefone.",
  );
  assertEquals(
    validateTemplateInput({ ...base, actions: [{ type: "copy_code", value: "A1" }, { type: "copy_code", value: "B2" }] }),
    "O template aceita no máximo 1 botão de copiar código.",
  );
  const elevenQr = Array.from({ length: 11 }, (_, i) => ({ id: String(i), title: `B${i}` }));
  assertEquals(validateTemplateInput({ ...base, buttons: elevenQr }), "O template aceita no máximo 10 botões.");
  assertEquals(validateTemplateInput({ ...base, buttons: [{ id: "x", title: "x".repeat(26) }] }), `O botão "${"x".repeat(26)}" passa de 25 caracteres.`);
  assertEquals(validateTemplateInput({ ...base, actions: [{ type: "url", title: "L", value: "https://x.test/" + "a".repeat(2000) }] }), 'O link do botão "L" passa de 2000 caracteres.');
  assertEquals(validateTemplateInput({ ...base, actions: [{ type: "url", title: "L", value: "https://x.test/{{1}}/a" }] }), 'O link do botão "L" só aceita a variável {{1}} no final.');
  assertEquals(validateTemplateInput({ ...base, actions: [{ type: "url", title: "L", value: "https://x.test/{{2}}" }] }), 'O link do botão "L" só aceita a variável {{1}} no final.');
  assertEquals(validateTemplateInput({ ...base, actions: [{ type: "url", title: "L", value: "https://x.test/{{1}}" }] }), 'Informe um exemplo para a variável do link do botão "L".');
  assertEquals(validateTemplateInput({ ...base, actions: [{ type: "url", title: "L", value: "javascript:alert(1)" }] }), 'Informe um link válido para o botão "L".');
  assertEquals(validateTemplateInput({ ...base, actions: [{ type: "phone", title: "T", value: "abc" }] }), 'Informe um telefone válido, com código do país, para o botão "T".');
  assertEquals(validateTemplateInput({ ...base, actions: [{ type: "copy_code", value: "COM ESPACO" }] }), "O código de exemplo deve ter só letras e números.");
  assertEquals(validateTemplateInput({ ...base, actions: [{ type: "copy_code", value: "A".repeat(16) }] }), "O código de exemplo deve ter no máximo 15 caracteres.");
});

Deno.test("criação: cabeçalho de texto com {{1}} exige e envia exemplo", () => {
  const input: CreateInput = { ...base, header: "Pedido {{1}}", headerExample: "987" };
  assertEquals(validateTemplateInput(input), null);
  assertEquals(buildComponents(input)[0], { type: "HEADER", format: "TEXT", text: "Pedido {{1}}", example: { header_text: ["987"] } });
  assertEquals(validateTemplateInput({ ...base, header: "Pedido {{1}}" }), "Informe um exemplo para a variável do cabeçalho.");
  assertEquals(validateTemplateInput({ ...base, header: "{{1}} e {{2}}", headerExample: "a" }), "O cabeçalho aceita no máximo uma variável, {{1}}.");
  assertEquals(validateTemplateInput({ ...base, header: "x".repeat(61) }), "O cabeçalho deve ter no máximo 60 caracteres.");
});

Deno.test("criação: cabeçalho de mídia usa header_handle e ignora texto", () => {
  for (const format of ["IMAGE", "VIDEO", "DOCUMENT"] as const) {
    const input: CreateInput = { ...base, header: "ignorado", headerFormat: format, headerMediaUrl: "https://p.supabase.co/x" };
    assertEquals(validateTemplateInput(input), null);
    assertEquals(buildComponents(input, "4::aGFuZGxl")[0], { type: "HEADER", format, example: { header_handle: ["4::aGFuZGxl"] } });
    assertEquals(localTemplateType(input), "media");
    assertThrows(() => buildComponents(input));
  }
  assertEquals(validateTemplateInput({ ...base, headerFormat: "VIDEO" }), "Envie o arquivo de exemplo do cabeçalho.");
  assertEquals(validateTemplateInput({ ...base, headerFormat: "GIF" as never }), "Formato de cabeçalho inválido.");
});

Deno.test("criação: arquivo de exemplo só do storage da própria org, com tipo e tamanho válidos", () => {
  const sb = "https://ref.supabase.co";
  assertEquals(isAllowedSampleUrl(`${sb}/storage/v1/object/public/whatsapp-media/org1/templates/1-a.png`, sb, "org1"), true);
  assertEquals(isAllowedSampleUrl(`${sb}/storage/v1/object/public/whatsapp-media/org2/templates/1-a.png`, sb, "org1"), false);
  assertEquals(isAllowedSampleUrl(`https://evil.test/storage/v1/object/public/whatsapp-media/org1/a.png`, sb, "org1"), false);
  assertEquals(isAllowedSampleUrl(`${sb}/storage/v1/object/public/whatsapp-media/org1/`, sb, "org1"), false);
  assertEquals(isAllowedSampleUrl(`${sb}/storage/v1/object/public/whatsapp-media/org1/a.png`, sb, ""), false);
  assertEquals(validateSampleMedia("IMAGE", "image/png", 1000), null);
  assertEquals(validateSampleMedia("IMAGE", "image/gif", 1000), "O arquivo do cabeçalho deve ser imagem JPG ou PNG de até 5 MB.");
  assertEquals(validateSampleMedia("IMAGE", "image/jpeg", 5 * 1024 * 1024 + 1), "O arquivo do cabeçalho deve ser imagem JPG ou PNG de até 5 MB.");
  assertEquals(validateSampleMedia("VIDEO", "video/mp4; codecs=avc1", 16 * 1024 * 1024), null);
  assertEquals(validateSampleMedia("DOCUMENT", "application/pdf", 0), "O arquivo do cabeçalho está vazio.");
  assertEquals(guessMimeFromUrl("https://x/a/B.PDF?t=1"), "application/pdf");
  assertEquals(fileNameFromUrl("https://x/org1/templates/1731234567890-proposta%20final.pdf"), "proposta final.pdf");
});

// ---------- Envio ----------
Deno.test("envio: vídeo e documento por link; documento com filename", () => {
  const video = buildMetaTemplateComponents([{ type: "HEADER", format: "VIDEO" }, { type: "BODY", text: "Oi" }], { headerMediaUrl: "https://cdn.test/v.mp4" });
  assertEquals(video.components, [{ type: "header", parameters: [{ type: "video", video: { link: "https://cdn.test/v.mp4" } }] }]);
  const doc = buildMetaTemplateComponents([{ type: "HEADER", format: "DOCUMENT" }, { type: "BODY", text: "Oi" }], { headerMediaUrl: "https://cdn.test/d.pdf", headerFilename: "proposta.pdf" });
  assertEquals(doc.components, [{ type: "header", parameters: [{ type: "document", document: { link: "https://cdn.test/d.pdf", filename: "proposta.pdf" } }] }]);
  assertThrows(() => buildMetaTemplateComponents([{ type: "HEADER", format: "DOCUMENT" }], {}), Error, "Informe o documento do cabeçalho do template.");
  assertThrows(() => buildMetaTemplateComponents([{ type: "HEADER", format: "VIDEO" }], { headerMediaUrl: "http://cdn.test/v.mp4" }));
});

Deno.test("envio: imagem explícita prevalece; imagem gravada no template é usada como padrão", () => {
  const def: TemplateDefinition[] = [{ type: "HEADER", format: "IMAGE" }];
  assertEquals(buildMetaTemplateComponents(def, { headerImageUrl: "https://a.test/1.png" }).components[0], { type: "header", parameters: [{ type: "image", image: { link: "https://a.test/1.png" } }] });
  assertEquals(buildMetaTemplateComponents(def, { headerMediaUrl: "https://a.test/2.png" }).components[0], { type: "header", parameters: [{ type: "image", image: { link: "https://a.test/2.png" } }] });
});

Deno.test("envio: variável do cabeçalho de texto", () => {
  const def: TemplateDefinition[] = [{ type: "HEADER", format: "TEXT", text: "Pedido {{1}}" }, { type: "BODY", text: "Oi {{1}}" }];
  const result = buildMetaTemplateComponents(def, { headerText: " 987\n", body: { "1": "Ana" } });
  assertEquals(result.components, [
    { type: "header", parameters: [{ type: "text", text: "987" }] },
    { type: "body", parameters: [{ type: "text", text: "Ana" }] },
  ]);
  assertThrows(() => buildMetaTemplateComponents(def, { body: { "1": "Ana" } }), Error, "Este template exige variáveis no cabeçalho.");
});

Deno.test("envio: copiar código usa o código informado ou o exemplo aprovado", () => {
  const def: TemplateDefinition[] = [
    { type: "BODY", text: "Cupom" },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Sair" }, { type: "COPY_CODE", example: "PROMO10" }, { type: "URL", text: "Site", url: "https://x.test" }] },
  ];
  assertEquals(buildMetaTemplateComponents(def, { couponCode: "VIP20" }).components, [
    { type: "button", sub_type: "copy_code", index: "1", parameters: [{ type: "coupon_code", coupon_code: "VIP20" }] },
  ]);
  assertEquals(buildMetaTemplateComponents(def, {}).components, [
    { type: "button", sub_type: "copy_code", index: "1", parameters: [{ type: "coupon_code", coupon_code: "PROMO10" }] },
  ]);
  assertEquals(
    buildMetaTemplateComponents([{ type: "BUTTONS", buttons: [{ type: "COPY_CODE", text: "Copy offer code", example: ["SYNC5"] }] }], {}).components,
    [{ type: "button", sub_type: "copy_code", index: "0", parameters: [{ type: "coupon_code", coupon_code: "SYNC5" }] }],
  );
});

Deno.test("prévia: botão de copiar código sem texto ganha rótulo", () => {
  assertEquals(templateDisplay([{ type: "BUTTONS", buttons: [{ type: "COPY_CODE", example: "PROMO10" }] }]), { buttons: [{ type: "COPY_CODE", text: "Copiar código" }] });
});

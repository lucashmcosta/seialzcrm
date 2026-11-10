import { assertEquals } from "jsr:@std/assert@1";
import {
  interactiveFallbackText, matchTypedReply, metaInboundInteractiveReply, normalizeInteractive,
  toMetaInteractive, validateInteractive, type InteractivePayload,
} from "../supabase/functions/_shared/whatsapp-interactive.ts";

const botoes: InteractivePayload = normalizeInteractive({
  kind: "buttons", body: "O bebê já nasceu?", buttons: [{ id: "", title: "Já nasceu" }, { id: "", title: "Estou grávida" }],
});

Deno.test("normaliza ids a partir do texto", () => {
  assertEquals(botoes.kind === "buttons" && botoes.buttons.map((b) => b.id), ["ja_nasceu", "estou_gravida"]);
});

Deno.test("valida limites dos botões", () => {
  assertEquals(validateInteractive(botoes), []);
  const muitos = { kind: "buttons", body: "x", buttons: [1, 2, 3, 4].map((n) => ({ id: `b${n}`, title: `B${n}` })) } as InteractivePayload;
  assertEquals(validateInteractive(muitos).includes("Use de 1 a 3 botões."), true);
  const longo = { kind: "buttons", body: "x", buttons: [{ id: "a", title: "Um texto bem maior que vinte" }] } as InteractivePayload;
  assertEquals(validateInteractive(longo).some((m) => m.includes("20 caracteres")), true);
  const repetido = { kind: "buttons", body: "x", buttons: [{ id: "a", title: "Sim" }, { id: "b", title: "sim" }] } as InteractivePayload;
  assertEquals(validateInteractive(repetido).includes("Dois botões têm o mesmo texto."), true);
  assertEquals(validateInteractive({ ...botoes, body: " " } as InteractivePayload).includes("Escreva o texto da mensagem."), true);
});

Deno.test("valida lista e link", () => {
  const lista = normalizeInteractive({
    kind: "list", body: "Como você trabalhava?", buttonText: "Ver opções",
    sections: [{ rows: [{ id: "", title: "Carteira assinada" }, { id: "", title: "MEI" }] }],
  });
  assertEquals(validateInteractive(lista), []);
  const onze = { kind: "list", body: "x", buttonText: "Ver", sections: [{ rows: Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, title: `R${i}` })) }] } as InteractivePayload;
  assertEquals(validateInteractive(onze).includes("Use de 1 a 10 opções na lista."), true);
  const semTitulo = { kind: "list", body: "x", buttonText: "Ver", sections: [{ rows: [{ id: "a", title: "A" }] }, { rows: [{ id: "b", title: "B" }] }] } as InteractivePayload;
  assertEquals(validateInteractive(semTitulo).includes("Com mais de uma seção, todas precisam de título."), true);
  assertEquals(validateInteractive({ kind: "cta_url", body: "Veja", displayText: "Abrir", url: "https://a.com/x" }), []);
  assertEquals(validateInteractive({ kind: "cta_url", body: "Veja", displayText: "Abrir", url: "a.com" }).length, 1);
});

Deno.test("converte para a Cloud API", () => {
  assertEquals(toMetaInteractive(botoes), {
    type: "button", body: { text: "O bebê já nasceu?" },
    action: { buttons: [
      { type: "reply", reply: { id: "ja_nasceu", title: "Já nasceu" } },
      { type: "reply", reply: { id: "estou_gravida", title: "Estou grávida" } },
    ] },
  });
  assertEquals(toMetaInteractive({ kind: "cta_url", body: "Veja", footer: "Auxilius", displayText: "Abrir", url: "https://a.com" }), {
    type: "cta_url", body: { text: "Veja" }, footer: { text: "Auxilius" },
    action: { name: "cta_url", parameters: { display_text: "Abrir", url: "https://a.com" } },
  });
});

Deno.test("texto numerado para provedores sem botões", () => {
  assertEquals(interactiveFallbackText(botoes), "O bebê já nasceu?\n\n1. Já nasceu\n2. Estou grávida\n\nResponda com o número da opção (1 a 2).");
});

Deno.test("lê a escolha recebida da Meta", () => {
  assertEquals(metaInboundInteractiveReply({ type: "interactive", interactive: { type: "button_reply", button_reply: { id: "ja_nasceu", title: "Já nasceu" } } }),
    { kind: "button", id: "ja_nasceu", title: "Já nasceu" });
  assertEquals(metaInboundInteractiveReply({ type: "interactive", interactive: { type: "list_reply", list_reply: { id: "mei", title: "MEI" } } }),
    { kind: "list", id: "mei", title: "MEI" });
  assertEquals(metaInboundInteractiveReply({ type: "button", button: { payload: "Sim", text: "Sim" } }),
    { kind: "template_button", id: "Sim", title: "Sim" });
  assertEquals(metaInboundInteractiveReply({ type: "text", text: { body: "oi" } }), null);
});

Deno.test("casa resposta digitada com a opção", () => {
  assertEquals(matchTypedReply("2", botoes)?.id, "estou_gravida");
  assertEquals(matchTypedReply("opção 1", botoes)?.id, "ja_nasceu");
  assertEquals(matchTypedReply("ja nasceu", botoes)?.id, "ja_nasceu");
  assertEquals(matchTypedReply("5", botoes), null);
  assertEquals(matchTypedReply("talvez", botoes), null);
});

// deno test supabase/functions/plamev-quote/perguntar.test.ts
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Recusa } from "./logic.ts";
import * as P from "./perguntar.ts";

const MB = 1024 * 1024;
const mat = (id: string, bytes: number): P.MaterialIa => ({ id, titulo: id, descricao: "", tipo: "document", mimeType: "application/pdf", bytes });

Deno.test("materiais: entram na ordem até o limite do pedido", () => {
  const { dentro, fora } = P.materiaisQueCabem([mat("a", 8 * MB), mat("b", 10 * MB), mat("c", 5 * MB), mat("d", 1 * MB)]);
  assertEquals(dentro.map((m) => m.id), ["a", "b", "d"]);
  assertEquals(fora.map((m) => m.id), ["c"]);
});

Deno.test("conversa: cliente x vendedor, mídia sem texto vira marcador, só as últimas", () => {
  const texto = P.textoConversa([
    { direction: "inbound", content: "Oi, o  plano\ncobre castração?", media_type: null },
    { direction: "outbound", content: "", media_type: "image" },
    { direction: "inbound", content: null, media_type: null },
  ]);
  assertEquals(texto, "Cliente: Oi, o plano cobre castração?\nVendedor: [imagem]");
  const muitas = Array.from({ length: 30 }, (_, i) => ({ direction: "inbound", content: `m${i}`, media_type: null }));
  assertEquals(P.textoConversa(muitas).split("\n")[0], "Cliente: m10");
});

Deno.test("pedido: precisa de pergunta ou conversa", () => {
  assertEquals(P.pedidoPergunta({ pergunta: "  cobre castração? " }), { pergunta: "cobre castração?", usarConversa: false });
  assertEquals(P.pedidoPergunta({ usar_conversa: true }), { pergunta: "", usarConversa: true });
  assertEquals((assertThrows(() => P.pedidoPergunta({}), Recusa) as Recusa).codigo, "missing_pergunta");
  assertEquals((assertThrows(() => P.pedidoPergunta({ pergunta: "x".repeat(2001) }), Recusa) as Recusa).codigo, "invalid_pergunta");
  assertEquals(P.textoPedido("", "Cliente: oi"), [
    "Últimas mensagens da conversa com o cliente:", "<conversa>", "Cliente: oi", "</conversa>", "",
    "Sugira a resposta para a última dúvida do cliente nessa conversa.",
  ].join("\n"));
});

Deno.test("resposta: fontes só de materiais enviados, sem repetir", () => {
  const r = P.respostaIa(JSON.stringify({ resposta: " Cobre sim! ", encontrado: true, fontes: ["a", "x", "a", 3] }), new Set(["a", "b"]));
  assertEquals(r, { resposta: "Cobre sim!", encontrado: true, fontes: ["a"] });
  assertEquals((assertThrows(() => P.respostaIa("não é json", new Set()), Recusa) as Recusa).codigo, "ia_resposta_invalida");
  assertEquals((assertThrows(() => P.respostaIa('{"resposta":""}', new Set()), Recusa) as Recusa).codigo, "ia_resposta_invalida");
});

Deno.test("custo: cache gravado 1,25x e lido 0,1x", () => {
  assertEquals(P.tokensEntradaEquivalentes({ input_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 0 }), 1350);
  assertEquals(P.tokensEntradaEquivalentes({ input_tokens: 100, cache_read_input_tokens: 10000 }), 1100);
});

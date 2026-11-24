import { assertEquals } from "jsr:@std/assert@1";
import { catalogText, parseSuggestion, transcriptText, type LossOptions } from "./loss-suggestion.ts";

const options: LossOptions = {
  reasons: [
    { id: "r1", code: "A", name: "Preço", details: [{ id: "d1", code: "A1", name: "Achou caro", help_text: "pediu desconto" }] },
    { id: "r2", code: "B", name: "Sem resposta", details: [] },
  ],
};

Deno.test("catálogo lista detalhe e motivo sem detalhe", () => {
  assertEquals(catalogText(options), "A1 — Preço › Achou caro (pediu desconto)\nB — Sem resposta");
});

Deno.test("código de detalhe vira motivo + detalhe", () => {
  const s = parseSuggestion('ok {"code":"a1","confidence":0.8,"evidence":"disse que está caro"}', options);
  assertEquals(s, { reasonId: "r1", detailId: "d1", confidence: 0.8, evidence: "disse que está caro" });
});

Deno.test("código de motivo sem detalhe", () => {
  assertEquals(parseSuggestion('{"code":"B","confidence":2}', options)?.detailId, null);
  assertEquals(parseSuggestion('{"code":"B","confidence":2}', options)?.confidence, 1);
});

Deno.test("fora do cadastro, null ou texto solto = sem sugestão", () => {
  assertEquals(parseSuggestion('{"code":"Z9","confidence":0.9}', options), null);
  assertEquals(parseSuggestion('{"code":null,"confidence":0.2}', options), null);
  assertEquals(parseSuggestion("não sei", options), null);
});

Deno.test("conversa corta pelo começo e mantém o fim", () => {
  const lines = Array.from({ length: 100 }, (_, i) => ({ at: "2026-11-01T10:00:00Z", who: "cliente" as const, text: `msg ${i} ` + "x".repeat(300) }));
  const t = transcriptText(lines);
  assertEquals(t.includes("msg 99"), true);
  assertEquals(t.includes("msg 0 "), false);
});

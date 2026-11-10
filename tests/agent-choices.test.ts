import { assertEquals } from "jsr:@std/assert@1";
import { buildChoicesInteractive, withoutQuestionEcho } from "../supabase/functions/_shared/intelligence/agent-choices.ts";

Deno.test("até 3 opções viram botões", () => {
  const { payload, problems } = buildChoicesInteractive({ question: " Qual plano? ", options: ["Básico", "Plus "] });
  assertEquals(problems, []);
  assertEquals(payload, { kind: "buttons", body: "Qual plano?", header: undefined, footer: undefined, buttons: [{ id: "basico", title: "Básico" }, { id: "plus", title: "Plus" }] });
});
Deno.test("4 ou mais opções viram lista com uma seção e botão padrão", () => {
  const { payload } = buildChoicesInteractive({ question: "Qual horário?", options: ["8h", "10h", "14h", "16h"] });
  assertEquals(payload?.kind, "list");
  if (payload?.kind !== "list") return;
  assertEquals(payload.buttonText, "Ver opções");
  assertEquals(payload.sections.length, 1);
  assertEquals(payload.sections[0].rows.map((r) => r.title), ["8h", "10h", "14h", "16h"]);
  const custom = buildChoicesInteractive({ question: "Q", options: ["a", "b", "c", "d"], button_text: "Escolher" }).payload;
  assertEquals(custom?.kind === "list" ? custom.buttonText : null, "Escolher");
});
Deno.test("pergunta ou opções inválidas devolvem os problemas", () => {
  assertEquals(buildChoicesInteractive({ options: ["a", "b"] }).payload, null);
  assertEquals(buildChoicesInteractive({ question: "Q", options: ["a"] }).problems, ["Use de 2 a 10 opções em options."]);
  assertEquals(buildChoicesInteractive({ question: "Q", options: Array.from({ length: 11 }, (_, i) => `o${i}`) }).payload, null);
  assertEquals(buildChoicesInteractive({ question: "Q", options: "a,b" }).payload, null);
  // Botão até 20; linha da lista até 24.
  assertEquals(buildChoicesInteractive({ question: "Q", options: ["x".repeat(21), "b"] }).problems, ["O botão 1 passa de 20 caracteres."]);
  assertEquals(buildChoicesInteractive({ question: "Q", options: ["x".repeat(24), "b", "c", "d"] }).problems, []);
  assertEquals(buildChoicesInteractive({ question: "Q", options: ["Sim", "sim"] }).problems, ["Dois botões têm o mesmo texto."]);
});
Deno.test("mensagem igual à pergunta sai do texto", () => {
  assertEquals(withoutQuestionEcho(["Oi, Ana!", "  qual   PLANO? "], "Qual plano?"), ["Oi, Ana!"]);
  assertEquals(withoutQuestionEcho(["Qual plano você prefere hoje?"], "Qual plano?"), ["Qual plano você prefere hoje?"]);
  assertEquals(withoutQuestionEcho(["a"], undefined), ["a"]);
});

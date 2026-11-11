import { assertEquals } from "jsr:@std/assert@1";
import { evolutionTemplateText } from "../supabase/functions/_shared/evolution/template-text.ts";

Deno.test("lê o texto de mensagem com botões de outra empresa", () => {
  assertEquals(evolutionTemplateText({
    templateMessage: { interactiveMessageTemplate: { body: { text: "Seu boleto vence amanhã." }, footer: { text: "Empresa X" } } },
  }), "Seu boleto vence amanhã.\n\nEmpresa X");
  assertEquals(evolutionTemplateText({
    templateMessage: { hydratedTemplate: { hydratedContentText: "Lembrete de pagamento" } },
  }), "Lembrete de pagamento");
  assertEquals(evolutionTemplateText({ interactiveMessage: { body: { text: "Escolha uma opção" } } }), "Escolha uma opção");
});

Deno.test("sem texto devolve null", () => {
  assertEquals(evolutionTemplateText({ templateMessage: {} }), null);
  assertEquals(evolutionTemplateText({ conversation: "oi" }), null);
  assertEquals(evolutionTemplateText(null), null);
});

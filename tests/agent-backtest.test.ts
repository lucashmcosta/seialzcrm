import { assertEquals } from "jsr:@std/assert@1";
import { buildReplay, rateLimitWaitMs } from "../supabase/functions/_shared/intelligence/agent-backtest.ts";
import { classifyCase, countOutcomes, parseBrl, parseCalcText } from "../supabase/functions/_shared/widgets/labor-center/backtest.ts";

const calc = (total: string) => `*Cálculo da sua rescisão*\nDispensa sem justa causa · 01/09/2025 a 31/10/2026\nSalário considerado: R$ 3.080,00\n\n• Saldo: R$ 1,00\n\n*Total que você deveria ter recebido: ${total}*\n\n_Valores estimados._`;

Deno.test("lê o total, o período e o salário da mensagem do widget", () => {
  assertEquals(parseCalcText(calc("R$ 12.738,06")), { total: 12738.06, header: "Dispensa sem justa causa · 01/09/2025 a 31/10/2026", salary: 3080 });
  assertEquals(parseCalcText("Oi, tudo bem?"), null);
  assertEquals(parseBrl("R$ 1.621,00"), 1621);
});

Deno.test("conversa até a última mensagem do cliente; anexo vira aviso e áudio entra pelo que foi dito", () => {
  const r = buildReplay([
    { direction: "inbound", content: "Fui demitido", media_type: null },
    { direction: "outbound", content: "Quando entrou?", media_type: null },
    { direction: "inbound", content: "[Áudio]", media_type: "audio", transcript: "entrei em março" },
    { direction: "inbound", content: "CTPS_123.pdf", media_type: "document" },
    { direction: "outbound", content: "Recebi, vou calcular", media_type: null },
  ])!;
  assertEquals(r.history.map((m) => m.role), ["user", "assistant", "user"]);
  assertEquals(r.history[2].content, "entrei em março");
  assertEquals(r.message.includes("documento"), true);
  assertEquals(r.message.includes("123"), false);
  assertEquals(buildReplay([{ direction: "outbound", content: "Oi", media_type: null }]), null);
});

Deno.test("classifica: mesmo total (até 1%), diferente, pediu dados, sem calculadora", () => {
  const team = parseCalcText(calc("R$ 10.000,00"));
  assertEquals(classifyCase(team, parseCalcText(calc("R$ 10.050,00")), true), "mesmo_total");
  assertEquals(classifyCase(team, parseCalcText(calc("R$ 12.000,00")), true), "total_diferente");
  assertEquals(classifyCase(team, null, true), "pediu_dados");
  assertEquals(classifyCase(team, null, false), "sem_calculadora");
  assertEquals(countOutcomes(["mesmo_total", "erro", "mesmo_total"]).mesmo_total, 2);
});

Deno.test("limite de chamadas: lê quanto esperar", () => {
  assertEquals(rateLimitWaitMs({ error: "Rate limit exceeded for trace x. Retry after 55753ms." }), 55753);
  assertEquals(rateLimitWaitMs({ error: "Rate limit exceeded" }), 60000);
  assertEquals(rateLimitWaitMs({ success: true }), null);
});

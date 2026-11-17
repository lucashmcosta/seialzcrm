import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { LABOR_CALC_CLIENT_HEADER, laborCaseToolParameters, runLaborCaseForAgent } from "../supabase/functions/_shared/widgets/labor-center/agent-tool.ts";
import { calcularCaso, severanceClientText } from "../supabase/functions/_shared/widgets/labor-center/calc/index.ts";

const dispensado = {
  salario: 3080, admissao: "2025-09-01", ainda_trabalha: false, saida: "2026-10-31",
  desligamento: "sem_justa_causa", aviso: "indenizado", rescisao_recebida: "nao",
};

Deno.test("com os dados da saída, manda a mesma mensagem do widget da equipe", () => {
  const out = runLaborCaseForAgent({ fatos: dispensado }, "2026-11-17");
  assert(out.clientText);
  assert(out.clientText.startsWith(LABOR_CALC_CLIENT_HEADER));
  // Mesmo motor e mesmo texto que a equipe copia no widget.
  const facts = Object.fromEntries(Object.entries(dispensado).map(([k, v]) => [k, { value: v, source: "lead" }]));
  const sim = calcularCaso({ facts: facts as any, settings: { filingDate: "2026-11-17" } }).severance!;
  assertEquals(out.clientText, severanceClientText(sim));
  assertStringIncludes(out.modelMessage, "não prometa");
  assert(out.teamNote?.includes("TOTAL ESTIMADO"));
});

Deno.test("faltando dado obrigatório, não manda valor e diz o que perguntar", () => {
  const { salario: _s, ...semSalario } = dispensado;
  const out = runLaborCaseForAgent({ fatos: semSalario }, "2026-11-17");
  assertEquals(out.clientText, null);
  assertStringIncludes(out.modelMessage, "salário");
});

Deno.test("como saiu ainda não perguntado: pergunta antes de mandar", () => {
  const { desligamento: _d, aviso: _a, ...semSaida } = dispensado;
  const out = runLaborCaseForAgent({ fatos: semSaida }, "2026-11-17");
  assertEquals(out.clientText, null);
  assertStringIncludes(out.modelMessage, "Como foi a saída");
});

Deno.test("prazo de 2 anos vencido: não manda cálculo", () => {
  const out = runLaborCaseForAgent({ fatos: { ...dispensado, admissao: "2020-01-01", saida: "2023-06-30" } }, "2026-11-17");
  assertEquals(out.clientText, null);
  assertStringIncludes(out.modelMessage, "Não mande cálculo");
});

Deno.test("não sabe: usa a premissa e não pergunta de novo", () => {
  const { aviso: _a, ...semAviso } = dispensado;
  const out = runLaborCaseForAgent({ fatos: semAviso, nao_sabe: ["aviso"] }, "2026-11-17");
  assert(out.clientText);
});

Deno.test("esquema da ferramenta traz todos os fatos do widget", () => {
  const p = laborCaseToolParameters() as any;
  assertEquals(p.properties.fatos.properties.desligamento.enum.includes("sem_justa_causa"), true);
  assertEquals(p.properties.fatos.properties.salario.type, "number");
  assertEquals(p.properties.fatos.properties.admissao.description.includes("AAAA-MM-DD"), true);
});

import { laborCenterAgentTool } from "../supabase/functions/_shared/widgets/labor-center/agent-tool.ts";
import { describeCtps, storageRef } from "../supabase/functions/_shared/widgets/labor-center/ctps-reader.ts";

Deno.test("ferramenta de widget: manda o cálculo uma vez só na conversa", async () => {
  const ctx = { supabase: {} as any, organizationId: "o1", isTestMode: true, history: [] as Array<{ role: string; content: string }> };
  const first = await laborCenterAgentTool.run({ fatos: dispensado }, ctx);
  assert(first.clientText);
  assert(first.teamNote);
  const again = await laborCenterAgentTool.run({ fatos: dispensado }, { ...ctx, history: [{ role: "assistant", content: first.clientText! }] });
  assertEquals(again.clientText ?? null, null);
  const missing = await laborCenterAgentTool.run({ fatos: { salario: 2000 } }, ctx);
  assertStringIncludes(missing.modelMessage, "Não diga que fez estimativa");
});

Deno.test("carteira digital: só empresa e datas vão para o agente", () => {
  const txt = describeCtps([
    { cnpj: "11222333000181", empregador: "EMPRESA A", periodo: "16/05/2024 - 09/11/2026", atual: false, fim: "2026-11-09", prescreve_em: null, dentro_do_prazo: true, dias_para_prescrever: 700 },
    { cnpj: "11444777000161", empregador: "EMPRESA B", periodo: "01/02/2020 - Aberto", atual: true, fim: null, prescreve_em: null, dentro_do_prazo: true, dias_para_prescrever: null },
  ])!;
  assertStringIncludes(txt, "EMPRESA A, de 16/05/2024 a 09/11/2026 (contrato encerrado)");
  assertStringIncludes(txt, "EMPRESA B, desde 01/02/2020 (contrato aberto)");
  assertEquals(txt.includes("11222333000181"), false);
  assertEquals(describeCtps([]), null);
  assertEquals(storageRef("https://x.supabase.co/storage/v1/object/public/whatsapp-media/org/meta-inbound/1.pdf"), { bucket: "whatsapp-media", path: "org/meta-inbound/1.pdf" });
});

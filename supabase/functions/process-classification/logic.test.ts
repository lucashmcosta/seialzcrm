// deno test supabase/functions/process-classification/logic.test.ts --allow-read
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
// @ts-types="../_shared/classificacao/motor.d.ts"
import * as M from "../_shared/classificacao/motor.mjs";
import exportada from "../../../packages/motor-classificacao/dados/calibracao-exportada-2026-10-16.json" with { type: "json" };
import { calcular, chaveValida, estadoDoWidget, Recusa, recusaDaRpc, visaoVendedor } from "./logic.ts";

const V2 = { id: "cal-2", motor_version: "1.0.0", content: M.mesclarCalibracao(exportada, M.CALIBRACAO_V1).calibracao };
const ENTRADA = {
  salario: 3000, meses: 24, funcionarios: 50, diasSemana: 5, saida: "sem_justa_causa", local: "interno", testemunha: true,
  teses: ["horas_extras", "fgts"], respostas: { horas_extras: { he_ponto: "relogio", he_real: "sim", he_pagou: "nao", he_dia: 2 } },
};
const recusa = (f: () => unknown) => assertThrows(f, Recusa) as Recusa;

Deno.test("ajusteManual enviado pela API não muda faixa nem comissão (R1)", () => {
  const limpo = calcular(ENTRADA, V2);
  const inflado = calcular({ ...ENTRADA, ajusteManual: { horas_extras: 100, fgts: 100 } }, V2);
  assertEquals(inflado.resultado.faixa, limpo.resultado.faixa);
  assertEquals(inflado.resultado.comissao, limpo.resultado.comissao);
  assertEquals("ajusteManual" in inflado.entrada, false);
  assert(inflado.resultado.teses.every((t: { ajusteManual: boolean }) => !t.ajusteManual));
});

Deno.test("pergunta escondida enviada pela API é descartada antes do cálculo (R1)", () => {
  const comEscondida = calcular({ ...ENTRADA, respostas: { horas_extras: { ...ENTRADA.respostas.horas_extras, he_ponto: "nao_havia", he_real: "nao" } } }, V2);
  assertEquals(Object.keys((comEscondida.entrada.respostas as Record<string, object>).horas_extras).sort(), ["he_dia", "he_ponto"]);
});

Deno.test("falta preencher → 422 com as pendências, sem números", () => {
  const r = recusa(() => calcular({ ...ENTRADA, teses: ["insalubridade"], respostas: {} }, V2));
  assertEquals([r.status, r.codigo], [422, "falta_preencher"]);
  assertEquals(r.extra, { pendencias: [{ tese: "insalubridade", aviso: "MARQUE OS AGENTES" }] });
});

Deno.test("entrada inválida → 422 sem ecoar o valor", () => {
  const r = recusa(() => calcular({ ...ENTRADA, salario: "R$ 77777" }, V2));
  assertEquals([r.status, r.codigo, r.extra], [422, "entrada_invalida", { campo: "salario" }]);
  assert(!JSON.stringify({ m: r.mensagem, e: r.extra }).includes("77777"));
});

Deno.test("calibração de outro major do motor é recusada (R8)", () => {
  const r = recusa(() => calcular(ENTRADA, { ...V2, motor_version: "2.0.0" }));
  assertEquals([r.status, r.codigo], [409, "motor_incompativel"]);
  calcular(ENTRADA, { ...V2, motor_version: "1.9.3" }); // minor/patch: ok
});

Deno.test("calcula com a calibração recebida (v2 exportada ≠ semente v1)", () => {
  const v2 = calcular(ENTRADA, V2);
  assertEquals(v2.resultado, M.calcularCaso(v2.entrada, V2.content));
  const v1 = calcular(ENTRADA, { ...V2, content: M.CALIBRACAO_V1 });
  assert(v1.resultado.comissao !== v2.resultado.comissao, `v1 ${v1.resultado.comissao} × v2 ${v2.resultado.comissao}`);
});

Deno.test("visão do vendedor: só faixa, comissão, revisão e data (§5.3, §10.3)", () => {
  const v = visaoVendedor({ band: "OURO", commission: "100.00", in_review: false, created_at: "2026-10-18T12:00:00Z",
    // deno-lint-ignore no-explicit-any
    ...({ score: 55, input: { salario: 1 }, result: {} } as any) });
  assertEquals(v, { faixa: "OURO", comissao: 100, emRevisao: false, classificadoEm: "2026-10-18T12:00:00Z" });
});

Deno.test("nada é logado durante o cálculo (R9)", () => {
  const original = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  const saidas: unknown[] = [];
  console.log = console.error = console.warn = console.info = (...a: unknown[]) => saidas.push(a);
  try {
    calcular(ENTRADA, V2);
    try { calcular({ ...ENTRADA, salario: -1 }, V2); } catch { /* esperado */ }
  } finally { Object.assign(console, original); }
  assertEquals(saidas, []);
});

Deno.test("estado do widget (§5.1)", () => {
  const ativa = { in_review: false };
  const p = (status: "pending" | "released" | "refused", replacement_id: string | null = null) =>
    ({ status, created_at: "x", reason: null, replacement_id });
  assertEquals(estadoDoWidget(false, null, null), "fechada_sem_classificacao");
  assertEquals(estadoDoWidget(false, ativa, p("pending")), "fechada_classificada");
  assertEquals(estadoDoWidget(true, null, null), "sem_classificacao");
  assertEquals(estadoDoWidget(true, ativa, null), "classificada");
  assertEquals(estadoDoWidget(true, { in_review: true }, null), "em_revisao");
  assertEquals(estadoDoWidget(true, ativa, p("pending")), "pedido_pendente");
  assertEquals(estadoDoWidget(true, ativa, p("released")), "correcao_liberada");
  assertEquals(estadoDoWidget(true, ativa, p("released", "nova")), "classificada");
  assertEquals(estadoDoWidget(true, ativa, p("refused")), "pedido_recusado");
});

Deno.test("erros da RPC viram mensagens da SPEC", () => {
  assertEquals([recusaDaRpc("pc:opportunity_closed").status, recusaDaRpc("pc:opportunity_closed").mensagem],
    [409, "A oportunidade foi fechada: não dá mais para classificar."]);
  assertEquals(recusaDaRpc("pc:already_classified").status, 409);
  assertEquals(recusaDaRpc("pc:daily_limit").status, 429);
  assertEquals(recusaDaRpc("pc:not_owner").status, 403);
  assertEquals(recusaDaRpc("algo estranho").status, 500);
});

Deno.test("idempotency_key: formato", () => {
  assert(chaveValida("c1a2b3c4-d5e6"));
  assert(!chaveValida("curta"));
  assert(!chaveValida("tem espaço e ;drop"));
});

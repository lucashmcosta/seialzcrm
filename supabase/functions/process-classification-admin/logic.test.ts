// deno test supabase/functions/process-classification-admin/logic.test.ts --allow-read
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
// @ts-types="../_shared/classificacao/motor.d.ts"
import * as M from "../_shared/classificacao/motor.mjs";
import ouro from "../../../packages/motor-classificacao/tests/casos-ouro.json" with { type: "json" };
import exportada from "../../../packages/motor-classificacao/dados/calibracao-exportada-2026-10-16.json" with { type: "json" };
import { type Cal, conferir, comparar, matrizFaixas, normalizarRascunho, podeCalibrar, podePublicar, previaImpacto, Recusa, simular } from "./logic.ts";

const V1 = M.CALIBRACAO_V1 as Cal;
const V2 = M.mesclarCalibracao(exportada, M.CALIBRACAO_V1).calibracao as Cal;

Deno.test("matriz faixa × score = calcularCaso em todos os casos-ouro (paridade com o motor)", () => {
  let n = 0;
  // deno-lint-ignore no-explicit-any
  for (const c of (ouro as any).casos) {
    const cal = (c.calibracao === "v1" ? V1 : c.calibracao) as Cal;
    const r = M.calcularCaso(c.entrada, cal);
    if (!r.ajusteScore || !r.faixaPorValor) continue;
    const celula = matrizFaixas(cal)[["PRATA", "OURO", "TITANIO", "DIAMANTE"].indexOf(r.faixaPorValor)][r.ajusteScore.faixaScore];
    assertEquals([celula.faixa, celula.comissao, celula.emRevisao], [r.faixa, r.comissao, r.emRevisao], `caso ${c.id}`);
    n++;
  }
  assert(n > 300, `só ${n} casos`);
});

Deno.test("rascunho aceita só chaves conhecidas; o export do protótipo entra sem ignorados (§10.7)", () => {
  const ok = normalizarRascunho(exportada, V1);
  assertEquals(ok.ignorados, []);
  assertEquals(comparar(V1, ok.calibracao).length, 37);
  const lixo = normalizarRascunho({ ...exportada, horas_extras: { probs: { inventada: 50, forte_sem_ponto: 99 } } }, V2);
  assertEquals(lixo.ignorados, ["horas_extras.probs.inventada"]);
  assertEquals((lixo.calibracao.horas_extras as { probs: Record<string, number> }).probs.forte_sem_ponto, 99);
  assertThrows(() => normalizarRascunho("não é json", V2), Recusa);
});

Deno.test("conferir aponta problema que impede publicar", () => {
  assertEquals(conferir(V2), []);
  const ruim = structuredClone(V2) as Cal;
  ruim._faixas.limites = [90000, 30000, 200000];
  assert(conferir(ruim).some((p) => p.startsWith("Faixas:")));
});

Deno.test("simular devolve tudo para o admin (chances, valores, detalhe)", () => {
  const { resultado } = simular({ salario: 3000, meses: 24, funcionarios: 50, diasSemana: 5, saida: "sem_justa_causa", local: "interno",
    testemunha: true, teses: ["horas_extras"], respostas: { horas_extras: { he_ponto: "relogio", he_real: "sim", he_pagou: "nao", he_dia: 2 } } }, V2);
  const t = resultado.teses[0];
  assert(typeof t.prob === "number" && typeof t.bruto === "number" && t.detalhe.length > 0 && typeof resultado.score === "number");
  assertThrows(() => simular({ salario: -1 }, V2), Recusa);
});

Deno.test("prévia de impacto = recálculo manual (§10.8)", () => {
  // deno-lint-ignore no-explicit-any
  const casos = (ouro as any).casos.slice(0, 40).map((c: any, i: number) => {
    const r = M.calcularCaso(c.entrada, V1);
    return { classificationId: `c${i}`, opportunityId: `o${i}`, sellerId: i % 2 ? "ana" : "caio", input: c.entrada, band: r.faixa, commission: r.comissao };
  });
  const p = previaImpacto(casos, V2);
  for (const l of casos.slice(0, 3)) {
    const manual = M.calcularCaso(l.input, V2);
    const m = p.maioresMudancas.find((x) => x.classificationId === l.classificationId);
    if (manual.comissao !== l.commission || manual.faixa !== l.band) assertEquals(m?.para, { faixa: manual.faixa, comissao: manual.comissao });
  }
  const totalNovo = casos.reduce((s: number, l: { input: unknown }) => s + M.calcularCaso(l.input, V2).comissao, 0);
  assertEquals(p.totalNova, totalNovo);
  assertEquals(p.sobem + p.descem + p.ficam, p.casos);
  assertEquals(p.porVendedor.reduce((s, v) => s + v.casos, 0), p.casos);
  assertEquals(p.matriz.flat().reduce((s, x) => s + x, 0) <= p.casos, true);
});

Deno.test("permissões", () => {
  assert(podeCalibrar({ administracao: { calibrar_classificacao: true } }));
  assert(!podeCalibrar({ administracao: { publicar_calibracao: true } }));
  assert(podePublicar({ administracao: { publicar_calibracao: true } }));
  assert(!podePublicar(null));
});

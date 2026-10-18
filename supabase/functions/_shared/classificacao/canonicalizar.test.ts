// deno test supabase/functions/_shared/classificacao/canonicalizar.test.ts --allow-read
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
// @ts-types="./motor.d.ts"
import * as M from "./motor.mjs";
import { criarCanonicalizador, EntradaInvalida } from "./canonicalizar.ts";
import ouro from "../../../../packages/motor-classificacao/tests/casos-ouro.json" with { type: "json" };

const { canonicalizar } = criarCanonicalizador(M);

const BASE = {
  salario: 3000, meses: 24, funcionarios: 50, diasSemana: 5, saida: "sem_justa_causa", local: "interno", testemunha: false,
  teses: ["horas_extras"], respostas: { horas_extras: { he_ponto: "relogio", he_real: "sim", he_pagou: "nao", he_dia: 2 } },
};
const codigo = (f: () => unknown) => {
  try { f(); } catch (e) { if (e instanceof EntradaInvalida) return `${e.codigo}:${e.campo}`; throw e; }
  return "ok";
};

Deno.test("descarta ajusteManual, campos desconhecidos e respostas de teses não marcadas", () => {
  const e = canonicalizar({
    ...BASE, ajusteManual: { horas_extras: 100 }, extra: 1,
    respostas: { ...BASE.respostas, fgts: { fgts_meses: 99 }, horas_extras: { ...BASE.respostas.horas_extras, inventada: "x" } },
  });
  assertEquals("ajusteManual" in e, false);
  assertEquals("extra" in e, false);
  assertEquals(Object.keys(e.respostas as object), ["horas_extras"]);
  assertEquals("inventada" in (e.respostas as Record<string, object>).horas_extras, false);
});

Deno.test("ajusteManual não muda o resultado do motor", () => {
  const cal = M.CALIBRACAO_V1;
  const limpo = M.calcularCaso(canonicalizar(BASE), cal);
  const comAjuste = M.calcularCaso(canonicalizar({ ...BASE, ajusteManual: { horas_extras: 100 } }), cal);
  assertEquals(comAjuste, limpo);
});

Deno.test("perguntas escondidas não vão e as visíveis levam o valor marcado", () => {
  const e = canonicalizar({ ...BASE, respostas: { horas_extras: { he_ponto: "nao_havia", he_real: "nao", he_pagou: "sim" } } });
  assertEquals((e.respostas as Record<string, object>).horas_extras, { he_ponto: "nao_havia", he_dia: 2 });
});

Deno.test("sim/não do topo viram boolean; perguntas da saída só quando a saída pede", () => {
  const e = canonicalizar({ ...BASE, saida: "sem_registro", testemunha: "sim", riFalta: "doc", vinculoTemProva: true });
  assertEquals(e.testemunha, true);
  assertEquals(e.vinculoTemProva, true);
  assertEquals(e.vinculoEmpresaAdmite, false);
  assertEquals("riFalta" in e, false);
});

Deno.test("recusa valores fora das opções, números inválidos e teses desconhecidas", () => {
  assertEquals(codigo(() => canonicalizar({ ...BASE, saida: "inventada" })), "opcao_invalida:saida");
  assertEquals(codigo(() => canonicalizar({ ...BASE, salario: -1 })), "numero_invalido:salario");
  assertEquals(codigo(() => canonicalizar({ ...BASE, diasSemana: 9 })), "numero_invalido:diasSemana");
  assertEquals(codigo(() => canonicalizar({ ...BASE, teses: [] })), "sem_teses:teses");
  assertEquals(codigo(() => canonicalizar({ ...BASE, teses: ["pensao"] })), "tese_invalida:teses");
  assertEquals(codigo(() => canonicalizar({ ...BASE, respostas: { horas_extras: { he_ponto: "x" } } })), "opcao_invalida:horas_extras.he_ponto");
  assertEquals(codigo(() => canonicalizar(null)), "formato_invalido:entrada");
});

Deno.test("o erro não carrega o valor recebido", () => {
  const e = assertThrows(() => canonicalizar({ ...BASE, salario: "R$ 99999-segredo" }), EntradaInvalida);
  assert(!e.message.includes("99999"));
});

Deno.test("opções órfãs de múltipla escolha saem (EPI de agente desmarcado)", () => {
  const e = canonicalizar({
    ...BASE, teses: ["insalubridade"],
    respostas: { insalubridade: { ins_agentes: ["calor"], ins_recebe: "nao", ins_epi_ags: ["calor", "frio"] } },
  });
  assertEquals((e.respostas as Record<string, Record<string, unknown>>).insalubridade.ins_epi_ags, ["calor"]);
});

// Casos-ouro (entradas aleatórias, com perguntas escondidas e ajuste manual). Sem o ajuste, a Entrada
// canônica dá o mesmo resultado do motor, com UMA exceção conhecida e reportada ao Lucas: em
// "sem registro" a tela esconde "Recebeu a rescisão?" (resc), mas o motor a lê se vier na entrada.
// Pela SPEC as escondidas não vão, então a canônica difere só em verbas_rescisorias nesses casos.
Deno.test("casos-ouro: Entrada canônica = mesmo resultado do motor (exceto a exceção conhecida)", () => {
  // deno-lint-ignore no-explicit-any
  const casos = (ouro as any).casos as any[];
  let comparados = 0;
  for (const c of casos) {
    const cal = c.calibracao === "v1" ? M.CALIBRACAO_V1 : c.calibracao;
    const crua = structuredClone(c.entrada);
    delete crua.ajusteManual;
    let can;
    try { can = canonicalizar(crua); } catch (e) {
      // as entradas aleatórias trazem diasSemana 0 e meses 0, que a tela não aceita
      assert(e instanceof EntradaInvalida && ["diasSemana", "meses"].includes(e.campo), `caso ${c.id}: ${e}`);
      continue;
    }
    assertEquals(canonicalizar(can), can, `caso ${c.id}: canonicalizar não é idempotente`);
    const a = M.calcularCaso(crua, cal), b = M.calcularCaso(can, cal);
    const excecao = crua.saida === "sem_registro" && crua.respostas?.verbas_rescisorias?.resc !== undefined;
    a.teses.forEach((t: { tese: string; bruto: number; prob: number; aviso: string }, i: number) => {
      if (excecao && t.tese === "verbas_rescisorias") return;
      const u = b.teses[i];
      assertEquals([u.tese, u.bruto, u.prob, u.aviso], [t.tese, t.bruto, t.prob, t.aviso], `caso ${c.id}`);
    });
    if (!excecao) assertEquals([b.faixa, b.comissao, b.score], [a.faixa, a.comissao, a.score], `caso ${c.id}`);
    comparados++;
  }
  assert(comparados >= 250, `só ${comparados} casos comparados`);
});

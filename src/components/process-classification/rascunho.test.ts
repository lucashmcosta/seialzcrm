// @ts-nocheck — executado com bun test
import { describe, expect, it } from 'bun:test';
// O motor completo só entra no TESTE (para conferir a tela contra o cálculo); nunca no bundle.
import * as M from '../../../supabase/functions/_shared/classificacao/motor.mjs';
import {
  TESES, alternarTese, errosDados, escolherSaida, montarEntrada, numeroBR, pendencia, rascunhoDeEntrada, rascunhoInicial, responder, rotuloCampo, telaDaTese,
} from './rascunho';
import { canonicalizar } from './perguntas';
import ouro from '../../../packages/motor-classificacao/tests/casos-ouro.json';

const base = () => {
  let r = rascunhoInicial();
  r = { ...r, topo: { ...r.topo, salario: '3.500,00', meses: '30', funcionarios: '40' } };
  return r;
};

describe('assistente do vendedor', () => {
  it('passo 1: mensagens de erro do protótipo e padrão de 5 dias', () => {
    const r = rascunhoInicial();
    expect(r.topo.diasSemana).toBe('5');
    expect(errosDados(r)).toEqual({ salario: 'Informe o salário.', meses: 'Informe os meses de vínculo.', funcionarios: 'Informe o número de funcionários.' });
    expect(errosDados({ ...base(), topo: { ...base().topo, diasSemana: '8' } })).toEqual({ diasSemana: 'Dias por semana: de 1 a 7.' });
    expect(errosDados(base())).toEqual({});
  });

  it('número no formato brasileiro', () => {
    expect(numeroBR('3.500,50')).toBe(3500.5);
    expect(numeroBR('R$ 1.200')).toBe(1200); // ponto com grupos de 3 = milhar
    expect(numeroBR('2.5')).toBe(2.5);
    expect(numeroBR('1200')).toBe(1200);
    expect(numeroBR('')).toBeUndefined();
    expect(numeroBR('abc')).toBeUndefined();
  });

  it('"Sem registro" marca sozinho as teses e a informalidade; o vendedor pode desmarcar', () => {
    let r = escolherSaida(alternarTese(base(), 'horas_extras'), 'sem_registro');
    expect(r.teses).toEqual(['horas_extras', 'verbas_rescisorias', 'fgts', 'dano_moral']);
    expect(r.respostas.dano_moral.dano_sits).toEqual(['informalidade']);
    r = alternarTese(r, 'fgts');
    r = escolherSaida(r, 'sem_registro'); // já estava: não remarca
    expect(r.teses).not.toContain('fgts');
  });

  it('o "Próximo" trava com a mensagem do motor', () => {
    const r = alternarTese(base(), 'insalubridade');
    expect(pendencia(r, 'insalubridade')).toBe('Marque os agentes de exposição.');
    expect(pendencia(responder(r, 'insalubridade', 'ins_agentes', ['calor']), 'insalubridade')).toBe('');
    expect(pendencia(alternarTese(base(), 'equiparacao'), 'equiparacao')).toBe('Informe quanto o colega ganha a mais por mês.');
    expect(pendencia(responder(alternarTese(base(), 'horas_extras'), 'horas_extras', 'he_dia', -2), 'horas_extras')).toContain('Confira os números');
  });

  it('pergunta aparece e some conforme a resposta', () => {
    let r = alternarTese(base(), 'horas_extras');
    expect(telaDaTese(r, 'horas_extras').perguntas.map((p) => p.id)).toEqual(['he_ponto', 'he_real', 'he_pagou', 'he_dia']);
    r = responder(r, 'horas_extras', 'he_ponto', 'nao_havia');
    expect(telaDaTese(r, 'horas_extras').perguntas.map((p) => p.id)).toEqual(['he_ponto', 'he_dia']);
  });

  // §5.2: "Um teste garante que valor marcado na tela = valor que o motor assume".
  // Sem mexer em nada, a Entrada da tela (com os valores marcados) dá o MESMO resultado que o motor
  // calcula sozinho com as respostas vazias (os padrões internos dele), em todas as combinações.
  it('valor marcado na tela = valor que o motor assume (todas as teses × saídas × local × testemunha × meses)', () => {
    let n = 0;
    for (const saida of ['sem_justa_causa', 'rescisao_indireta', 'pedido_demissao', 'sem_registro', 'justa_causa'])
      for (const local of ['interno', 'externo'])
        for (const testemunha of ['sim', 'nao'])
          for (const meses of ['6', '30'])
            for (const t of TESES) {
              let r = { ...base(), topo: { ...base().topo, saida, local, testemunha, meses } };
              r = alternarTese(r, t);
              if (t === 'insalubridade') r = responder(r, t, 'ins_agentes', ['calor']);
              if (t === 'dano_moral') r = responder(r, t, 'dano_sits', ['atraso']);
              if (t === 'equiparacao') r = responder(r, t, 'eq_dif', 300);
              const tela = montarEntrada(r);
              const soMarcadas = { ...tela, respostas: { [t]: Object.fromEntries(Object.entries(r.respostas[t] ?? {})) } };
              const a = M.calcularCaso(tela, M.CALIBRACAO_V1), b = M.calcularCaso(soMarcadas, M.CALIBRACAO_V1);
              expect([a.teses[0].bruto, a.teses[0].prob, a.faixa, a.comissao]).toEqual([b.teses[0].bruto, b.teses[0].prob, b.faixa, b.comissao]);
              n++;
            }
    expect(n).toBe(5 * 2 * 2 * 2 * TESES.length);
  });

  it('a Entrada não leva perguntas escondidas nem campos da saída que não se aplicam', () => {
    let r = escolherSaida(base(), 'rescisao_indireta');
    r = { ...r, topo: { ...r.topo, vinculoTemProva: 'sim' } }; // sobra de quando estava em "sem registro"
    r = responder(alternarTese(r, 'horas_extras'), 'horas_extras', 'he_ponto', 'nao_havia');
    r = responder(r, 'horas_extras', 'he_real', 'nao');
    const e = montarEntrada(r);
    expect(e.riFalta).toBe('doc');
    expect('vinculoTemProva' in e).toBe(false);
    expect(e.respostas.horas_extras).toEqual({ he_ponto: 'nao_havia', he_dia: 2 });
    expect(e.testemunha).toBe(false);
  });

  it('certificação: Entrada gravada → tela → Entrada é exata (casos-ouro)', () => {
    let n = 0;
    for (const c of ouro.casos) {
      const crua = { ...c.entrada }; delete crua.ajusteManual;
      let can;
      try { can = canonicalizar(crua); } catch { continue; }
      expect(montarEntrada(rascunhoDeEntrada(can))).toEqual(can);
      n++;
    }
    expect(n).toBeGreaterThan(250);
  });

  it('certificação: rótulos dos campos alterados', () => {
    expect(rotuloCampo('testemunha')).toBe('Testemunha do período?');
    expect(rotuloCampo('horas_extras.he_dia')).toBe('Horas extras — Horas extra/dia');
    expect(rotuloCampo('+fgts')).toBe('Tese incluída: FGTS não depositado');
    expect(rotuloCampo('-fgts')).toBe('Tese removida: FGTS não depositado');
  });
});

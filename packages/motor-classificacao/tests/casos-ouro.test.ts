// Casos-ouro: 400 casos conferidos contra o protótipo validado (motor v3). Se algum mudar, a regra mudou → nova versão do motor.
import { describe, expect, it } from 'vitest';
import { CALIBRACAO_V1, calcularCaso, type Calibracao } from '../src';
import ouro from './casos-ouro.json';

const perto = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

describe(`casos-ouro (${ouro.casos.length} casos)`, () => {
  it.each(ouro.casos.map(c => [c.id, c] as const))('caso %i', (_id, c: any) => {
    const cal = (c.calibracao === 'v1' ? CALIBRACAO_V1 : c.calibracao) as Calibracao;
    const r = calcularCaso(c.entrada, cal), e = c.esperado;
    expect({ faixa: r.faixa, faixaPorValor: r.faixaPorValor, comissao: r.comissao, score: r.score, emRevisao: r.emRevisao })
      .toEqual({ faixa: e.faixa, faixaPorValor: e.faixaPorValor, comissao: e.comissao, score: e.score, emRevisao: e.emRevisao });
    r.teses.forEach((t, i) => {
      const x = e.teses[i];
      expect(t.tese).toBe(x.tese); expect(t.aviso).toBe(x.aviso); expect(t.excluida).toBe(x.excluida);
      expect(perto(t.bruto, x.bruto), `${t.tese}.bruto ${t.bruto} × ${x.bruto}`).toBe(true);
      expect(perto(t.prob, x.prob), `${t.tese}.prob ${t.prob} × ${x.prob}`).toBe(true);
    });
  });
});

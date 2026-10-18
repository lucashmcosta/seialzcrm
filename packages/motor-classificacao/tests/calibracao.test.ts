// Tela do administrador: importar, conferir antes de publicar e comparar versões.
import { describe, expect, it } from 'vitest';
import { CALIBRACAO_V1, compararCalibracoes, conferirCalibracao, mesclarCalibracao, type Calibracao } from '../src';
import ouro from './casos-ouro.json';

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

describe('importar calibração (mesmo formato do "Exportar" do protótipo)', () => {
  it('a semente importada nela mesma não muda nada', () => {
    expect(mesclarCalibracao(clone(CALIBRACAO_V1)).calibracao).toEqual(CALIBRACAO_V1);
  });
  it('calibrações diferentes entram inteiras', () => {
    for (const c of (ouro as any).casos.filter((x: any) => x.calibracao !== 'v1').slice(0, 30))
      expect(mesclarCalibracao(c.calibracao).calibracao).toEqual(c.calibracao);
  });
  it('arquivo de versão antiga: número que saiu é ignorado, número novo fica com o valor atual', () => {
    const velha: any = clone(CALIBRACAO_V1);
    velha.horas_extras.probs.regra_antiga = 50; delete velha.gestante.probs.temporaria_2026; velha._salvo_em = '2026-10-01';
    velha.horas_extras.probs.fraude_com_test = 81;
    const r = mesclarCalibracao(velha);
    expect(r.ignorados).toContain('horas_extras.probs.regra_antiga');
    expect((r.calibracao as any).gestante.probs.temporaria_2026).toBe((CALIBRACAO_V1 as any).gestante.probs.temporaria_2026);
    expect((r.calibracao as any).horas_extras.probs.fraude_com_test).toBe(81);
  });
  it('faixa de score fora do limite é corrigida (mover −3…+2; % nunca negativo)', () => {
    const x: any = clone(CALIBRACAO_V1); x._faixas.score_faixas[0] = { mover_faixa: 7, pct_comissao: -10 };
    const r = mesclarCalibracao(x).calibracao;
    expect(r._faixas.score_faixas[0]).toMatchObject({ mover_faixa: 2, pct_comissao: 0 });
  });
  it('lixo não entra', () => expect(() => mesclarCalibracao('abc')).toThrow());
});

describe('conferir antes de publicar', () => {
  it('a semente está ok', () => expect(conferirCalibracao(CALIBRACAO_V1 as Calibracao)).toEqual([]));
  it('limites fora de ordem e chance acima de 100 travam a publicação', () => {
    const x: any = clone(CALIBRACAO_V1); x._faixas.limites = [90000, 40000, 200000]; x.fgts.probs.com_extrato = 120;
    const p = conferirCalibracao(x);
    expect(p.some(m => m.startsWith('Faixas'))).toBe(true); expect(p.some(m => m.startsWith('fgts.com_extrato'))).toBe(true);
  });
});

describe('comparar versões (histórico)', () => {
  it('mostra só o que mudou, com o nome legível', () => {
    const b: any = clone(CALIBRACAO_V1); b.gestante.probs.temporaria_2026 = 60; b._faixas.comissao[1] = 120;
    const m = compararCalibracoes(CALIBRACAO_V1 as Calibracao, b);
    expect(m).toHaveLength(2);
    expect(m.find(x => x.caminho === 'gestante.probs.temporaria_2026')).toMatchObject({ antes: 55, depois: 60 });
    expect(m[0].rotulo.startsWith('Gestante')).toBe(true);
  });
});

describe('dados/ e src/ são a mesma coisa', () => {
  it('calibracao-v1.json = CALIBRACAO_V1 e catalogo.json = CATALOGO', async () => {
    const { CATALOGO } = await import('../src');
    expect((await import('../dados/calibracao-v1.json')).default).toEqual(CALIBRACAO_V1);
    expect((await import('../dados/catalogo.json')).default).toEqual(CATALOGO);
  });
});

// @ts-nocheck — executado com bun test
// Risco R3: o navegador do vendedor recebe o catálogo reduzido. Ele precisa produzir EXATAMENTE as mesmas
// perguntas (visibilidade, rótulos, opções e valor marcado) que o catálogo completo do motor.
import { describe, expect, it, mock } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import { catalogoVendedor } from '../../../scripts/gen-catalogo-vendedor.mjs';
import { CATALOGO as REDUZIDO } from './catalogoVendedor';
import ouro from '../../../packages/motor-classificacao/tests/casos-ouro.json';

const raiz = path.resolve(import.meta.dir, '../../..');
const completo = JSON.parse(fs.readFileSync(path.join(raiz, 'packages/motor-classificacao/dados/catalogo.json'), 'utf8'));

describe('catálogo do vendedor', () => {
  it('está atualizado com o catálogo do motor (rode node scripts/gen-catalogo-vendedor.mjs)', () => {
    expect(REDUZIDO).toEqual(catalogoVendedor(completo));
  });

  it('não leva números nem explicações jurídicas', () => {
    const texto = JSON.stringify(REDUZIDO);
    for (const proibido of ['"probs"', '"valores"', '"sub"', '"fora"', 'Súm', 'ônus']) expect(texto).not.toContain(proibido);
    const temNumero = (v) => typeof v === 'number' || (v && typeof v === 'object' && Object.values(v).some(temNumero));
    expect(temNumero(REDUZIDO)).toBe(false);
  });

  it('gera as mesmas perguntas que o catálogo completo (casos-ouro)', async () => {
    const C = await import('../../../packages/motor-classificacao/src/perguntas.ts');
    mock.module(path.join(raiz, 'packages/motor-classificacao/src/catalogo.ts'), () => ({ CATALOGO: REDUZIDO }));
    const R = await import('../../../packages/motor-classificacao/src/perguntas.ts?catalogo=vendedor');
    expect(R).not.toBe(C);

    const tela = (M, t, r, c) => M.perguntasVisiveis(t, r, c).map((p) => ({
      id: p.id,
      rotulo: typeof p.rotulo === 'function' ? p.rotulo(r, c) : p.rotulo,
      opcoes: typeof p.opcoes === 'function' ? p.opcoes(r, c, undefined) : p.opcoes,
      padrao: M.padraoDe(p, c),
    }));
    expect(R.NOME_TESE).toEqual(C.NOME_TESE);
    let telas = 0;
    for (const caso of ouro.casos) {
      const e = caso.entrada;
      const c = { saida: e.saida, local: e.local, meses: e.meses, testemunha: e.testemunha, teses: e.teses };
      for (const t of Object.keys(C.PERGUNTAS)) {
        const r = e.respostas?.[t] ?? {};
        expect(tela(R, t, r, c)).toEqual(tela(C, t, r, c));
        expect(R.pendenciaDaTese(t, r)).toBe(C.pendenciaDaTese(t, r));
        telas++;
      }
    }
    expect(telas).toBeGreaterThan(5000);
  });
});

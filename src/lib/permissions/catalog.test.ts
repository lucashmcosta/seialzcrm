// @ts-nocheck — executado com bun test
import { describe, expect, it } from 'bun:test';
import { ADMIN_ITEMS, DATA_OBJECTS, TEMPLATES, TOOLS, normalize, visibleFor, withDefaults } from './catalog';
import { fromLegacy } from './convert';

const tpl = (k: string) => TEMPLATES.find((t) => t.key === k)!.perms;

describe('permissões do módulo de classificação', () => {
  it('perfil salvo antes do módulo abre sem quebrar e sem acesso', () => {
    const antigo = fromLegacy({}, true);
    delete antigo.dados.classificacoes;
    delete antigo.ferramentas.classificar;
    delete antigo.administracao.publicar_calibracao;
    const p = normalize(antigo);
    expect(p.dados.classificacoes).toEqual({ ver: 'nenhum' });
    expect(p.ferramentas.classificar).toBe(false);
    expect(p.administracao.publicar_calibracao).toBe(false);
    expect(withDefaults(antigo).dados.contatos).toEqual(antigo.dados.contatos);
  });

  it('itens do módulo só aparecem com o módulo ligado', () => {
    const off = visibleFor(new Set());
    const on = visibleFor(new Set(['process_classification']));
    expect(DATA_OBJECTS.filter(off).map((o) => o.key)).not.toContain('classificacoes');
    expect(DATA_OBJECTS.filter(on).map((o) => o.key)).toContain('classificacoes');
    expect(TOOLS.filter(off).map((t) => t.key)).not.toContain('classificar');
    expect(ADMIN_ITEMS.filter(on).map((a) => a.key)).toContain('ver_numeros_classificacao');
  });

  it('modelos: vendedor classifica e vê as próprias; não libera correção nem vê números', () => {
    const v = tpl('vendedor');
    expect(v.ferramentas.classificar).toBe(true);
    expect(v.ferramentas.liberar_correcao).toBe(false);
    expect(v.dados.classificacoes.ver).toBe('meus');
    expect(v.administracao.ver_numeros_classificacao).toBe(false);
  });

  it('modelos: gestor vê todas e libera correção, sem números nem calibração', () => {
    const g = tpl('gestor');
    expect(g.dados.classificacoes.ver).toBe('todos');
    expect(g.ferramentas.liberar_correcao).toBe(true);
    expect(g.administracao.ver_numeros_classificacao).toBe(false);
    expect(g.administracao.calibrar_classificacao).toBe(false);
  });

  it('nenhum modelo certifica (atribuído ao Jurídico no rollout)', () => {
    for (const t of TEMPLATES) expect(t.perms.ferramentas.certificar_classificacao).toBe(false);
  });

  it('modelos de atendimento não classificam', () => {
    for (const k of ['atendente', 'supervisor']) {
      expect(tpl(k).ferramentas.classificar).toBe(false);
      expect(tpl(k).dados.classificacoes.ver).toBe('nenhum');
    }
  });
});

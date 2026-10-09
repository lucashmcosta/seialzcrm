// @ts-nocheck — executado com bun test
import { describe, expect, it } from 'bun:test';
import { fromLegacy, toLegacy, LEGACY_KEYS } from './convert';

const allTrue = Object.fromEntries(LEGACY_KEYS.map((k) => [k, true]));

describe('conversão de permissões', () => {
  it('tem as 26 chaves antigas', () => expect(LEGACY_KEYS).toHaveLength(26));

  it('tudo true sobrevive ida e volta', () => {
    for (const priv of [true, false]) expect(toLegacy(fromLegacy(allTrue, priv))).toEqual(allTrue);
  });

  it('tudo false com privacidade: só tarefas/wa/ia ligados', () => {
    const p = fromLegacy({}, true);
    expect(p.dados.contatos.ver).toBe('meus');
    expect(p.dados.contatos.editar).toBe('nenhum');
    expect(p.dados.atendimentos.excluir).toBe('nenhum');
    const back = toLegacy(p);
    expect(back.can_view_contacts).toBe(true);
    expect(back.view_all_contacts).toBe(false);
  });

  it('sem privacidade, ver vira todos', () => {
    expect(fromLegacy({}, false).dados.contatos.ver).toBe('todos');
  });

  it('cada chave isolada volta igual (exceto as derivadas)', () => {
    for (const k of LEGACY_KEYS) {
      const back = toLegacy(fromLegacy({ [k]: true }, true));
      if (['can_view_contacts', 'can_view_opportunities'].includes(k)) continue;
      if (k === 'can_delete_contacts' || k === 'can_delete_opportunities') { expect(back[k]).toBe(false); continue; }
      expect(back[k]).toBe(true);
    }
  });

  it('equipe volta como false', () => {
    const p = fromLegacy(allTrue, true);
    p.dados.contatos.ver = 'equipe';
    expect(toLegacy(p).view_all_contacts).toBe(false);
  });

  it('perfil comercial amplo não ganha encerrar/atribuir atendimento', () => {
    const p = fromLegacy({
      view_all_contacts: true, view_all_opportunities: true, view_all_threads: true, can_view_all_calls: true,
      can_make_calls: true, can_receive_calls: true, can_transfer_calls: true, can_edit_contacts: true, manage_assignments: true,
    }, true);
    expect(p.dados.atendimentos.excluir).toBe('nenhum');
    expect(p.dados.atendimentos.atribuir).toBe('nenhum');
  });
});

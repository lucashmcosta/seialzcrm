import { describe, expect, test } from 'bun:test';
import {
  clearPanelFilters, conversationCountLabel, countActivePanelFilters, EMPTY_FILTERS, parseCardPrefs, parseFilters, toRpcFilters,
} from '../src/lib/commercialThreadFilters';

describe('filtros do Comercial', () => {
  test('padrão manda só a situação', () => {
    expect(toRpcFilters(EMPTY_FILTERS)).toEqual({ view: 'open' });
  });

  test('monta todos os filtros ativos para o servidor', () => {
    const f = { ...EMPTY_FILTERS, view: 'awaiting_client' as const, search: ' ana ', handlers: ['ai' as const], oppStates: ['open' as const],
      stageIds: ['s1'], oppTagIds: ['t1'], origin: 'ad' as const, adIds: ['123'], unread: true, unassigned: true, endpointIds: ['e1'] };
    const r = toRpcFilters(f, { threadIds: ['x'] });
    expect(r).toMatchObject({ view: 'awaiting_client', search: 'ana', handlers: ['ai'], opp_states: ['open'], stage_ids: ['s1'],
      opp_tag_ids: ['t1'], origin: 'ad', ad_ids: ['123'], unread: true, unassigned: true, endpoint_ids: ['e1'], thread_ids: ['x'] });
  });

  test('data final é inclusiva (vai até o início do dia seguinte)', () => {
    const r = toRpcFilters({ ...EMPTY_FILTERS, createdFrom: '2026-11-01', createdTo: '2026-11-01' });
    const from = new Date(r.created_from as string).getTime();
    const to = new Date(r.created_to as string).getTime();
    expect(to - from).toBe(24 * 3600 * 1000);
  });

  test('lê valores salvos sem confiar no formato', () => {
    const p = parseFilters({ view: 'xyz', handlers: ['ai', 'hack'], createdFrom: 'ontem', unread: 'sim', oppStates: ['won'] });
    expect(p.view).toBe('open');
    expect(p.handlers).toEqual(['ai']);
    expect(p.createdFrom).toBe('');
    expect(p.unread).toBe(false);
    expect(p.oppStates).toEqual(['won']);
    expect(parseFilters(null)).toEqual(EMPTY_FILTERS);
  });

  test('conta e limpa filtros do painel mantendo aba e busca', () => {
    const f = { ...EMPTY_FILTERS, view: 'resolved' as const, search: 'x', handlers: ['ai' as const], createdFrom: '2026-11-01', createdTo: '2026-11-02' };
    expect(countActivePanelFilters(f)).toBe(2);
    expect(clearPanelFilters(f)).toEqual({ ...EMPTY_FILTERS, view: 'resolved', search: 'x' });
  });

  test('contador com singular e plural nas duas línguas', () => {
    expect(conversationCountLabel(1, 'pt-BR')).toBe('1 conversa');
    expect(conversationCountLabel(14900, 'pt-BR')).toBe('14.900 conversas');
    expect(conversationCountLabel(1, 'en-US')).toBe('1 conversation');
    expect(conversationCountLabel(2, 'en-US')).toBe('2 conversations');
  });

  test('preferências do card têm padrão seguro', () => {
    expect(parseCardPrefs(undefined)).toEqual({ stage: true, tags: false, endpoint: true });
    expect(parseCardPrefs({ tags: true })).toEqual({ stage: true, tags: true, endpoint: true });
  });
});

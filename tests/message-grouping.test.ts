import { describe, it, expect } from 'vitest';
import { computeMessageGroups, GROUP_GAP_MS, type GroupingItem } from '../src/lib/messageGrouping';

const T0 = Date.parse('2026-08-14T10:00:00Z');

function msg(over: Partial<GroupingItem> = {}): GroupingItem {
  return {
    kind: 'message',
    direction: 'outbound',
    senderType: 'user',
    senderId: 'u1',
    timestamp: T0,
    ...over,
  };
}

const flags = (items: GroupingItem[]) => computeMessageGroups(items);

describe('computeMessageGroups', () => {
  it('agrupa mensagens do mesmo autor dentro da janela', () => {
    const r = flags([msg(), msg({ timestamp: T0 + 60_000 }), msg({ timestamp: T0 + 120_000 })]);
    expect(r.map((f) => f.isGroupStart)).toEqual([true, false, false]);
    expect(r.map((f) => f.isGroupEnd)).toEqual([false, false, true]);
  });

  it('quebra quando a direção muda', () => {
    const r = flags([msg(), msg({ direction: 'inbound', senderType: null, senderId: null, timestamp: T0 + 1000 })]);
    expect(r.map((f) => f.isGroupStart)).toEqual([true, true]);
    expect(r[0].isGroupEnd).toBe(true);
  });

  it('agrupa inbound consecutivos apenas pela direção', () => {
    const inbound = () => msg({ direction: 'inbound', senderType: null, senderId: null });
    const r = flags([inbound(), { ...inbound(), timestamp: T0 + 1000 }]);
    expect(r.map((f) => f.isGroupStart)).toEqual([true, false]);
  });

  it('quebra quando o operador muda', () => {
    const r = flags([msg(), msg({ senderId: 'u2', timestamp: T0 + 1000 })]);
    expect(r.map((f) => f.isGroupStart)).toEqual([true, true]);
  });

  it('quebra quando o sender_type muda (usuário -> agente IA)', () => {
    const r = flags([msg(), msg({ senderType: 'agent', senderId: 'a1', timestamp: T0 + 1000 })]);
    expect(r.map((f) => f.isGroupStart)).toEqual([true, true]);
  });

  it('quebra quando o intervalo passa de GROUP_GAP_MS', () => {
    const r = flags([msg(), msg({ timestamp: T0 + GROUP_GAP_MS + 1 })]);
    expect(r.map((f) => f.isGroupStart)).toEqual([true, true]);
  });

  it('nota interna e evento de sistema quebram o agrupamento', () => {
    const r = flags([
      msg(),
      { ...msg({ timestamp: T0 + 1000 }), kind: 'note' },
      msg({ timestamp: T0 + 2000 }),
      { ...msg({ timestamp: T0 + 3000 }), kind: 'system' },
      msg({ timestamp: T0 + 4000 }),
    ]);
    expect(r.map((f) => f.isGroupStart)).toEqual([true, true, true, true, true]);
    expect(r.map((f) => f.isGroupEnd)).toEqual([true, true, true, true, true]);
  });

  it('mensagem que responde outra inicia novo grupo', () => {
    const r = flags([msg(), msg({ timestamp: T0 + 1000, isReply: true })]);
    expect(r.map((f) => f.isGroupStart)).toEqual([true, true]);
  });

  it('mensagem com falha encerra o grupo', () => {
    const r = flags([msg({ failed: true }), msg({ timestamp: T0 + 1000 })]);
    expect(r.map((f) => f.isGroupStart)).toEqual([true, true]);
    expect(r[0].isGroupEnd).toBe(true);
  });

  it('mídia e áudio agrupam com texto do mesmo autor', () => {
    const r = flags([msg(), msg({ timestamp: T0 + 1000 }), msg({ timestamp: T0 + 2000 })]);
    expect(r.map((f) => f.isGroupStart)).toEqual([true, false, false]);
  });

  it('separador de data e troca de número quebram o grupo', () => {
    const r = flags([
      msg(),
      msg({ timestamp: T0 + 1000, dateBreak: true }),
      msg({ timestamp: T0 + 2000, endpointBreak: true }),
    ]);
    expect(r.map((f) => f.isGroupStart)).toEqual([true, true, true]);
  });

  it('grupo de uma mensagem é início e fim', () => {
    const r = flags([msg()]);
    expect(r).toEqual([{ isGroupStart: true, isGroupEnd: true }]);
  });
});

import { computeContextBlocks } from '../src/lib/messageGrouping';

const starts = (items: GroupingItem[]) => computeContextBlocks(items).map((b) => b.isBlockStart);

describe('computeContextBlocks', () => {
  it('mantém um único bloco para o mesmo operador/número/provider', () => {
    const base = { endpointId: 'e1', provider: 'meta_cloud_api' };
    expect(starts([msg(base), msg({ ...base, timestamp: T0 + 1000 })])).toEqual([true, false]);
  });

  it('gap maior que 5 min NÃO abre novo bloco', () => {
    expect(starts([msg(), msg({ timestamp: T0 + GROUP_GAP_MS * 10 })])).toEqual([true, false]);
  });

  it('troca de direção NÃO abre novo bloco', () => {
    expect(starts([msg(), msg({ direction: 'inbound', senderId: null, senderType: null })])).toEqual([true, false]);
  });

  it('inbound entre duas outbound do mesmo operador mantém o cartão', () => {
    expect(
      starts([
        msg(),
        msg({ direction: 'inbound', senderId: null, senderType: null, timestamp: T0 + 1000 }),
        msg({ timestamp: T0 + 2000 }),
      ]),
    ).toEqual([true, false, false]);
  });

  it('troca de operador abre novo bloco', () => {
    expect(starts([msg(), msg({ senderId: 'u2' })])).toEqual([true, true]);
  });

  it('troca de operador através de um inbound abre novo bloco', () => {
    expect(
      starts([
        msg(),
        msg({ direction: 'inbound', senderId: null, senderType: null }),
        msg({ senderId: 'u2' }),
      ]),
    ).toEqual([true, false, true]);
  });

  it('entrada de IA abre novo bloco', () => {
    expect(starts([msg(), msg({ senderType: 'agent', senderId: 'a1' })])).toEqual([true, true]);
  });


  it('troca de endpoint abre novo bloco', () => {
    expect(starts([msg({ endpointId: 'e1' }), msg({ endpointId: 'e2' })])).toEqual([true, true]);
  });

  it('troca de provider abre novo bloco', () => {
    expect(
      starts([
        msg({ endpointId: 'e1', provider: 'meta_cloud_api' }),
        msg({ endpointId: 'e1', provider: 'evolution_api' }),
      ]),
    ).toEqual([true, true]);
  });

  it('evento de sistema e nota interna são blocos próprios', () => {
    const r = computeContextBlocks([
      msg(),
      { ...msg(), kind: 'system' },
      msg(),
      { ...msg(), kind: 'note', direction: 'internal' },
      msg(),
    ]);
    expect(r.map((b) => b.isBlockStart)).toEqual([true, true, true, true, true]);
    expect(r.map((b) => b.isBlockEnd)).toEqual([true, true, true, true, true]);
    expect(r.map((b) => b.blockIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it('separador de data e troca de número abrem novo bloco', () => {
    expect(starts([msg(), msg({ dateBreak: true }), msg({ endpointBreak: true })])).toEqual([true, true, true]);
  });
});

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

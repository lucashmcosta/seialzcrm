import { test, expect } from 'bun:test';
import { formatWait, hourRangeLabel, sentence, slowHourRanges, speedInsight } from '../src/lib/intelligenceConversations';

test('compara rápido e lento só com base suficiente e diferença real', () => {
  expect(speedInsight([{ bucket: 1, conversations: 38, engaged: 24 }, { bucket: 4, conversations: 37, engaged: 15 }]))
    .toBe('Respondidas em menos de 5 min, 63% das conversas seguiram até 5 mensagens do cliente. Acima de 2 h, foram 41%.');
  expect(speedInsight([{ bucket: 1, conversations: 10, engaged: 8 }, { bucket: 4, conversations: 37, engaged: 15 }])).toBeNull();
  expect(speedInsight([{ bucket: 1, conversations: 30, engaged: 15 }, { bucket: 4, conversations: 30, engaged: 14 }])).toBeNull();
});

test('junta horas lentas seguidas e ordena pelo volume', () => {
  const rows = [0, 1, 2, 3, 9, 10, 17].map((hour) => ({ hour, conversations: hour === 17 ? 13 : 5, median_minutes: hour === 10 ? 7 : 120 }));
  expect(slowHourRanges(rows)).toEqual([
    { from: 0, to: 3, conversations: 20, maxMedian: 120 },
    { from: 17, to: 17, conversations: 13, maxMedian: 120 },
    { from: 9, to: 9, conversations: 5, maxMedian: 120 },
  ]);
});

test('textos curtos', () => {
  expect(formatWait(45)).toBe('45 min');
  expect(formatWait(150)).toBe('2,5 h');
  expect(formatWait(120)).toBe('2 h');
  expect(formatWait(608)).toBe('10 h');
  expect(hourRangeLabel(0, 5)).toBe('0h às 6h');
  expect(hourRangeLabel(23, 23)).toBe('23h às 0h');
  expect(sentence('você já teve o bebê?')).toBe('Você já teve o bebê?');
});

import { expect, test } from 'bun:test';
import { MIN_DEALS_FOR_RATE, ratePercent, stageRows } from '../src/lib/intelligenceInsights';

test('taxa não aparece com poucos negócios', () => {
  expect(ratePercent(1, 2, MIN_DEALS_FOR_RATE)).toBeNull();
  expect(ratePercent(3, 5, MIN_DEALS_FOR_RATE)).toBe(60);
  expect(ratePercent(0, 0)).toBeNull();
  expect(ratePercent(1, 3)).toBe(33);
});

test('etapas seguem o funil, sem "unknown" nem etapa vazia', () => {
  const rows = stageRows([
    { stage: 'closing', messages: 10, signals: 5 },
    { stage: 'unknown', messages: 99, signals: 9 },
    { stage: 'discovery', messages: 20, signals: 1 },
    { stage: 'negotiation', messages: 0, signals: 0 },
  ]);
  expect(rows.map((r) => r.stage)).toEqual(['discovery', 'closing']);
  expect(rows[1].percent).toBe(50);
});

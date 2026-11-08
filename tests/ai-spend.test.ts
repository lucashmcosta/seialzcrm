import { expect, test } from 'bun:test';
import { budgetUsage, formatUsd, summarizeAiSpend } from '../src/lib/aiSpend';

test('soma por provedor, aceita valores em texto e ordena pelo maior custo', () => {
  const out = summarizeAiSpend([
    { provider: 'anthropic', action: 'improve_text', calls: '3', cost_usd: '0.5', calls_without_cost: '1' },
    { provider: 'anthropic', action: 'transcribe_call', calls: 2, cost_usd: 1.5, calls_without_cost: 0 },
    { provider: 'openai', action: 'analyze_message', calls: 1, cost_usd: 0, calls_without_cost: 1 },
  ]);
  expect(out.anthropic.costUsd).toBe(2);
  expect(out.anthropic.calls).toBe(5);
  expect(out.anthropic.callsWithoutCost).toBe(1);
  expect(out.anthropic.actions[0].action).toBe('transcribe_call');
  expect(out.openai.calls).toBe(1);
});

test('barra do limite: sem limite, normal, alerta e estourado', () => {
  expect(budgetUsage(10, null).level).toBe('none');
  expect(budgetUsage(10, 0).level).toBe('none');
  expect(budgetUsage(10, 200)).toEqual({ percent: 5, level: 'ok' });
  expect(budgetUsage(160, '200').level).toBe('warning');
  expect(budgetUsage(300, 200)).toEqual({ percent: 100, level: 'exceeded' });
});

test('valor muito pequeno não aparece como zero', () => {
  expect(formatUsd(0.001, 'pt-BR')).toBe('< US$ 0,01');
  expect(formatUsd(0, 'pt-BR')).toBe('US$ 0,00');
  expect(formatUsd(12.5, 'en-US')).toBe('US$ 12.50');
});

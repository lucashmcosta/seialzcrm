import { test, expect } from 'bun:test';
import { describeDistribution, isValidDistribution } from '../src/lib/agentDistribution';

test('valores fora do limite não valem', () => {
  expect(isValidDistribution('all', null)).toBe(true);
  expect(isValidDistribution('every_n', 1)).toBe(false);
  expect(isValidDistribution('every_n', 4)).toBe(true);
  expect(isValidDistribution('percent', 0)).toBe(false);
  expect(isValidDistribution('percent', 101)).toBe(false);
  expect(isValidDistribution('percent', 25.5)).toBe(false);
  expect(isValidDistribution('daily_quota', null)).toBe(false);
  expect(isValidDistribution('daily_quota', 10)).toBe(true);
});
test('a descrição diz o que vai acontecer', () => {
  expect(describeDistribution('every_n', 4)).toContain('1 a cada 4');
  expect(describeDistribution('percent', 25)).toContain('25%');
  expect(describeDistribution('daily_quota', 10)).toContain('10');
  expect(describeDistribution('percent', 0)).toContain('válido');
});

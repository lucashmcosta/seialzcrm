import { test, expect } from 'bun:test';
import { displayThreadStatus } from '../src/lib/threadStatus';

test('a última mensagem decide de quem é a vez', () => {
  expect(displayThreadStatus('open', 'inbound')).toBe('reply');
  expect(displayThreadStatus('open', 'outbound')).toBe('awaiting_client');
  expect(displayThreadStatus('awaiting_client', 'inbound')).toBe('reply');
});

test('resolvida e fechada continuam como estão; sem direção, vale o status salvo', () => {
  expect(displayThreadStatus('resolved', 'inbound')).toBe('resolved');
  expect(displayThreadStatus('closed', 'outbound')).toBe('closed');
  expect(displayThreadStatus('open', 'internal')).toBe('open');
  expect(displayThreadStatus(null, null)).toBe('open');
});

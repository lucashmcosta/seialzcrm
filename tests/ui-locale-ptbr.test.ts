import { test, expect } from 'bun:test';
import { setUiLocale, uiText } from '../src/lib/ui-locale';
import { formatBucketLabel } from '../src/components/reports/trendBuckets';

// pt-BR é a fonte: uiText devolve a string original (com interpolação), independente do catálogo en-US.
test('uiText keeps pt-BR source strings and translates en-US', () => {
  setUiLocale('pt-BR');
  expect(uiText('Buscar configurações...')).toBe('Buscar configurações...');
  expect(uiText('Nenhuma configuração encontrada para "{0}"', { 0: 'x' })).toBe('Nenhuma configuração encontrada para "x"');
  expect(uiText('Criadas x Ganhas')).toBe('Criadas x Ganhas');
  setUiLocale('en-US');
  expect(uiText('Buscar configurações...')).toBe('Search settings...');
  expect(uiText('Criadas x Ganhas')).toBe('Created vs Won');
  expect(uiText('Não configurado')).toBe('Not configured');
  setUiLocale('pt-BR');
});

test('dashboard bucket labels follow the UI date order', () => {
  const d = new Date(2026, 9, 19);
  setUiLocale('pt-BR');
  expect(formatBucketLabel(d, false)).toBe('19/10');
  setUiLocale('en-US');
  expect(formatBucketLabel(d, false)).toBe('10/19');
  setUiLocale('pt-BR');
});

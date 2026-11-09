import { expect, test } from 'bun:test';
import { fmtOriginal, summarizeOriginalSpend } from '../src/pages/marketing/_lib/originalSpend';

test('soma por anúncio e no total, inclusive vindo como texto', () => {
  const r = summarizeOriginalSpend([
    { marketing_campaign_id: 'a', spend_currency: 'USD', spend_original_cents: 4124 },
    { marketing_campaign_id: 'a', spend_currency: 'USD', spend_original_cents: '100' },
    { marketing_campaign_id: 'b', spend_currency: 'USD', spend_original_cents: 295 },
  ]);
  expect(r?.totalCents).toBe(4519);
  expect(r?.byCampaign.get('a')).toBe(4224);
  expect(r?.currency).toBe('USD');
});

test('sem linha convertida não há aviso', () => {
  expect(summarizeOriginalSpend([])).toBeNull();
  expect(summarizeOriginalSpend([{ marketing_campaign_id: 'a', spend_currency: 'USD', spend_original_cents: null }])).toBeNull();
});

test('formata na moeda da conta', () => {
  expect(fmtOriginal(9519, 'USD')).toContain('95');
  expect(fmtOriginal(9519, 'USD')).toContain('US$');
});

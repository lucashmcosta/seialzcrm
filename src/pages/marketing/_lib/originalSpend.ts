// Soma do gasto na moeda da conta de anúncio. Testes em tests/original-spend.test.ts.
import { getUiLocale } from '@/lib/ui-locale';

export type OriginalSpendRow = {
  marketing_campaign_id: string;
  spend_currency: string | null;
  spend_original_cents: number | string | null;
};

export type OriginalSpend = { currency: string; totalCents: number; byCampaign: Map<string, number> };

export function summarizeOriginalSpend(rows: OriginalSpendRow[]): OriginalSpend | null {
  const validas = rows.filter((r) => r.spend_currency && r.spend_original_cents != null);
  if (validas.length === 0) return null;
  const byCampaign = new Map<string, number>();
  let totalCents = 0;
  for (const r of validas) {
    const cents = Number(r.spend_original_cents) || 0;
    totalCents += cents;
    byCampaign.set(r.marketing_campaign_id, (byCampaign.get(r.marketing_campaign_id) ?? 0) + cents);
  }
  return { currency: validas[0].spend_currency!, totalCents, byCampaign };
}

export function fmtOriginal(cents: number, currency: string): string {
  return new Intl.NumberFormat(getUiLocale(), { style: 'currency', currency, currencyDisplay: 'symbol' }).format(cents / 100);
}

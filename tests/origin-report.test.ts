import { describe, expect, test } from 'bun:test';
import { buildOriginTree, type OriginReportRow } from '../src/lib/originReport';

const row = (p: Partial<OriginReportRow>): OriginReportRow => ({ origin_code: null, origin_name: null, campaign_id: null, campaign_name: null, adset_name: null, ad_name: null, thumbnail: null, leads: 0, won: 0, revenue: 0, spend: 0, ...p });
const L = { unknown: 'Não identificado', noCampaign: 'Sem campanha', noAdset: 'Sem conjunto' };

describe('buildOriginTree', () => {
  test('groups ads under campaign and adset, sums totals, unknown last', () => {
    const { nodes, total } = buildOriginTree([
      row({ leads: 5 }),
      row({ origin_code: 'meta_ads', origin_name: 'Meta Ads', campaign_id: 'a1', campaign_name: 'C1', adset_name: 'S1', ad_name: 'A1', leads: 10, won: 2, revenue: 1000, spend: 300 }),
      row({ origin_code: 'meta_ads', origin_name: 'Meta Ads', campaign_id: 'a2', campaign_name: 'C1', adset_name: 'S1', ad_name: 'A2', spend: 50 }),
      row({ origin_code: 'meta_ads', origin_name: 'Meta Ads', leads: 3 }),
      row({ origin_code: 'referral', origin_name: 'Indicação', leads: 2, won: 1, revenue: 500 }),
    ], L);
    expect(total).toEqual({ leads: 20, won: 3, revenue: 1500, spend: 350 });
    expect(nodes.map((n) => n.key)).toEqual(['meta_ads', 'referral', '_unknown']);
    const meta = nodes[0];
    expect(meta.spend).toBe(350);
    expect(meta.children.map((c) => c.label)).toEqual(['C1', 'Sem campanha']);
    expect(meta.children[0].children[0].children.map((a) => a.label)).toEqual(['A1', 'A2']);
    expect(meta.children[1].children).toEqual([]);
    expect(nodes[1].children).toEqual([]);
  });
});

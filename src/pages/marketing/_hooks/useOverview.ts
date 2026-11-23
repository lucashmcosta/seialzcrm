import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toISODate, previousRange } from '../_lib/format';

interface OverviewKPIs {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  conversations: number;
  opps_open: number;
  wins: number;
  revenue: number;
  cpl_real: number | null;
  cac: number | null;
  roas: number | null;
  lead_to_opp_pct: number | null;
}

async function fetchKPIs(orgId: string, from: Date, to: Date): Promise<OverviewKPIs> {
  const startISO = toISODate(from);
  const endISO = toISODate(to);

  // Insights daily — spend, impressions, clicks, conversations, leads_attributed (Meta-side)
  const { data: insights, error: insErr } = await supabase
    .from('marketing_campaign_insights_daily')
    .select('spend_cents, impressions, clicks, conversations_started')
    .eq('organization_id', orgId)
    .gte('date', startISO)
    .lte('date', endISO);
  if (insErr) throw insErr;

  let spend_cents = 0, impressions = 0, clicks = 0, conversations = 0;
  for (const r of insights || []) {
    spend_cents += Number(r.spend_cents || 0);
    impressions += Number(r.impressions || 0);
    clicks += Number(r.clicks || 0);
    conversations += Number(r.conversations_started || 0);
  }
  const spend = spend_cents / 100;

  // Leads, abertas e vendas vêm da fonte única de origem (ponte no banco: origens ligadas ou campanha antiga).
  // Vendas contam pela data da venda (won_at), não pela chegada do contato.
  const { data: attr, error: attrErr } = await supabase.rpc('get_marketing_overview_attribution' as any, {
    p_org: orgId, p_from: from.toISOString(), p_to: to.toISOString(),
  });
  if (attrErr) throw attrErr;
  const a = (attr || {}) as { leads?: number; opps_open?: number; wins?: number; revenue?: number };
  const leads = Number(a.leads || 0);
  const opps_open = Number(a.opps_open || 0);
  const wins = Number(a.wins || 0);
  const revenue = Number(a.revenue || 0);

  const leadsN = Number(leads || 0);
  const cpl_real = leadsN > 0 ? +(spend / leadsN).toFixed(2) : null;
  const cac = wins > 0 ? +(spend / wins).toFixed(2) : null;
  const roas = spend > 0 ? +(revenue / spend).toFixed(2) : null;
  const lead_to_opp_pct = leadsN > 0 ? +((opps_open + wins) / leadsN * 100).toFixed(1) : null;

  return {
    spend, impressions, clicks, leads: leadsN, conversations,
    opps_open, wins, revenue, cpl_real, cac, roas, lead_to_opp_pct,
  };
}

export function useOverviewKPIs(orgId: string | undefined, from: Date, to: Date) {
  return useQuery({
    queryKey: ['marketing', 'overview', orgId, from.toISOString(), to.toISOString()],
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5,
    queryFn: () => fetchKPIs(orgId!, from, to),
  });
}

export function useOverviewWithCompare(orgId: string | undefined, from: Date, to: Date) {
  const current = useOverviewKPIs(orgId, from, to);
  const prev = previousRange(from, to);
  const previous = useOverviewKPIs(orgId, prev.from, prev.to);
  return { current, previous };
}

export function useTimeSeries(orgId: string | undefined, from: Date, to: Date) {
  return useQuery({
    queryKey: ['marketing', 'timeseries', orgId, from.toISOString(), to.toISOString()],
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_campaign_insights_daily')
        .select('date, spend_cents, impressions, clicks, conversations_started, leads_attributed')
        .eq('organization_id', orgId!)
        .gte('date', toISODate(from))
        .lte('date', toISODate(to))
        .order('date', { ascending: true });
      if (error) throw error;

      const map = new Map<string, { date: string; spend: number; impressions: number; clicks: number; conversations: number; leads: number }>();
      for (const r of data || []) {
        const k = r.date as string;
        const cur = map.get(k) || { date: k, spend: 0, impressions: 0, clicks: 0, conversations: 0, leads: 0 };
        cur.spend += Number(r.spend_cents || 0) / 100;
        cur.impressions += Number(r.impressions || 0);
        cur.clicks += Number(r.clicks || 0);
        cur.conversations += Number(r.conversations_started || 0);
        cur.leads += Number(r.leads_attributed || 0);
        map.set(k, cur);
      }
      return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    },
  });
}

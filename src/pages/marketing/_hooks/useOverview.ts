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

  // Leads (CRM) — contacts with marketing_campaign_id created in range
  const fromTs = from.toISOString();
  const toTs = to.toISOString();

  const { count: leads } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .not('marketing_campaign_id', 'is', null)
    .is('deleted_at', null)
    .gte('created_at', fromTs)
    .lte('created_at', toTs);

  // Opportunities tied to attributed contacts in range
  const { data: oppContacts } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', orgId)
    .not('marketing_campaign_id', 'is', null)
    .is('deleted_at', null)
    .gte('created_at', fromTs)
    .lte('created_at', toTs);

  // Abertas: oportunidades dos contatos de anúncio que chegaram no período.
  let opps_open = 0, wins = 0, revenue = 0;
  if (oppContacts && oppContacts.length) {
    const ids = oppContacts.map(c => c.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data: opps, error } = await supabase
        .from('opportunities')
        .select('id')
        .eq('organization_id', orgId)
        .eq('status', 'open')
        .in('contact_id', ids.slice(i, i + 200))
        .is('deleted_at', null);
      if (error) throw error;
      opps_open += (opps || []).length;
    }
  }

  // Vendas: contam pela data da venda (won_at), não pela chegada do contato.
  // Antes, uma venda de hoje de um lead que chegou ontem sumia ao filtrar "Hoje".
  const { data: won, error: wonErr } = await supabase
    .from('opportunities')
    .select('amount, contact:contacts!inner(marketing_campaign_id)')
    .eq('organization_id', orgId)
    .eq('status', 'won')
    .is('deleted_at', null)
    .not('contact.marketing_campaign_id', 'is', null)
    .gte('won_at', fromTs)
    .lte('won_at', toTs);
  if (wonErr) throw wonErr;
  for (const o of won || []) {
    wins++;
    revenue += Number(o.amount || 0);
  }

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

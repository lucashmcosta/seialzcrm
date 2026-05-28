import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AdLead {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  first_contact_at: string;
  lifecycle_status: 'lead' | 'open' | 'won' | 'lost';
}

export function useAdLeads(adId: string | undefined, opts: { status?: string; search?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['marketing', 'ad-leads', adId, opts.status, opts.search, opts.limit],
    enabled: !!adId,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<AdLead[]> => {
      let q = supabase
        .from('contacts')
        .select('id, full_name, phone, email, created_at')
        .eq('marketing_campaign_id', adId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(opts.limit || 100);
      if (opts.search) q = q.ilike('full_name', `%${opts.search}%`);
      const { data: contacts, error } = await q;
      if (error) throw error;

      const ids = (contacts || []).map(c => c.id);
      if (ids.length === 0) return [];

      const { data: opps } = await supabase
        .from('opportunities')
        .select('contact_id, status')
        .in('contact_id', ids)
        .is('deleted_at', null);

      const byContact = new Map<string, AdLead['lifecycle_status']>();
      for (const o of opps || []) {
        const cur = byContact.get(o.contact_id);
        const next = (o.status === 'won') ? 'won'
                  : (o.status === 'open') ? 'open'
                  : (o.status === 'lost') ? 'lost' : null;
        if (!next) continue;
        if (!cur || (next === 'won') || (next === 'open' && cur === 'lost')) byContact.set(o.contact_id, next);
      }

      let rows: AdLead[] = (contacts || []).map(c => ({
        id: c.id,
        full_name: c.full_name,
        phone: c.phone,
        email: c.email,
        first_contact_at: c.created_at,
        lifecycle_status: byContact.get(c.id) || 'lead',
      }));

      if (opts.status && opts.status !== 'all') {
        rows = rows.filter(r => r.lifecycle_status === opts.status);
      }
      return rows;
    },
  });
}

export interface AdOpportunity {
  id: string;
  title: string | null;
  amount: number | null;
  status: 'open' | 'won' | 'lost' | string;
  close_date: string | null;
  created_at: string;
  contact_id: string;
  contact_name: string | null;
  contact_phone: string | null;
}

/**
 * Lista TODAS as oportunidades vinculadas a contatos deste ad.
 * Usa join embarcado com filtro `!inner` para garantir que o total bate
 * com o KPI "Wins/Opps Abertas" da view de performance.
 */
export function useAdOpportunities(
  adId: string | undefined,
  opts: { status?: string; search?: string; limit?: number } = {},
) {
  return useQuery({
    queryKey: ['marketing', 'ad-opps', adId, opts.status, opts.search, opts.limit],
    enabled: !!adId,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<AdOpportunity[]> => {
      let q = supabase
        .from('opportunities')
        .select(
          'id, title, amount, status, close_date, created_at, contact_id, contact:contacts!inner(id, full_name, phone, marketing_campaign_id, deleted_at)'
        )
        .eq('contact.marketing_campaign_id', adId!)
        .is('contact.deleted_at', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(opts.limit ?? 500);

      if (opts.status && opts.status !== 'all') {
        q = q.eq('status', opts.status);
      }
      if (opts.search) {
        q = q.ilike('contact.full_name', `%${opts.search}%`);
      }

      const { data, error } = await q;
      if (error) throw error;

      return (data || []).map((r: any) => ({
        id: r.id,
        title: r.title,
        amount: r.amount,
        status: r.status,
        close_date: r.close_date,
        created_at: r.created_at,
        contact_id: r.contact_id,
        contact_name: r.contact?.full_name ?? null,
        contact_phone: r.contact?.phone ?? null,
      }));
    },
  });
}

export function useAdDailyInsights(adId: string | undefined, days = 30) {
  return useQuery({
    queryKey: ['marketing', 'ad-daily', adId, days],
    enabled: !!adId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const start = new Date();
      start.setDate(start.getDate() - days);
      const startISO = start.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('marketing_campaign_insights_daily')
        .select('date, spend_cents, leads_attributed, impressions, clicks')
        .eq('marketing_campaign_id', adId!)
        .gte('date', startISO)
        .order('date', { ascending: true });
      if (error) throw error;
      return (data || []).map(r => ({
        date: r.date as string,
        spend: Number(r.spend_cents || 0) / 100,
        leads: Number(r.leads_attributed || 0),
        impressions: Number(r.impressions || 0),
        clicks: Number(r.clicks || 0),
      }));
    },
  });
}

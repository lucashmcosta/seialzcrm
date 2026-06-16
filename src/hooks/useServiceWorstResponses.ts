import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SERVICE_MODULE_START_ISO } from '@/lib/serviceCutoff';

export interface WorstResponseRow {
  id: string;
  thread_id: string;
  contact_id: string | null;
  contact_name: string | null;
  user_id: string | null;
  user_name: string | null;
  inbound_at: string;
  outbound_at: string | null;
  response_seconds: number;
}

export interface WorstResponseStats {
  median: number | null;
  p90: number | null;
  max: number | null;
  count: number;
}

interface Params {
  organizationId: string | null | undefined;
  from: Date;
  to: Date;
  ownerId: string;
  kind: 'first' | 'all';
  enabled: boolean;
  limit?: number;
}

export function useServiceWorstResponses({
  organizationId,
  from,
  to,
  ownerId,
  kind,
  enabled,
  limit = 20,
}: Params) {
  const [rows, setRows] = useState<WorstResponseRow[]>([]);
  const [stats, setStats] = useState<WorstResponseStats>({ median: null, p90: null, max: null, count: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !organizationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const fromIsoRaw = from.toISOString();
        const toIso = to.toISOString();
        const fromIso = fromIsoRaw < SERVICE_MODULE_START_ISO ? SERVICE_MODULE_START_ISO : fromIsoRaw;
        const owner = ownerId !== 'all' ? ownerId : null;

        const { data, error } = await supabase.rpc('get_service_worst_responses', {
          p_org: organizationId,
          p_from: fromIso,
          p_to: toIso,
          p_owner: owner,
          p_kind: kind,
          p_limit: limit,
        });
        if (error) throw error;
        if (cancelled) return;

        const arr = (data || []) as any[];
        const toNum = (v: unknown): number | null => {
          if (v == null) return null;
          const n = Number(v);
          return isFinite(n) ? n : null;
        };

        const enriched: WorstResponseRow[] = arr.map((r) => ({
          id: r.id,
          thread_id: r.thread_id,
          contact_id: r.contact_id ?? null,
          contact_name: r.contact_name ?? null,
          user_id: r.user_id ?? null,
          user_name: r.user_name ?? null,
          inbound_at: r.inbound_at,
          outbound_at: r.outbound_at,
          response_seconds: Number(r.response_seconds) || 0,
        }));

        const first = arr[0];
        setRows(enriched);
        setStats({
          median: toNum(first?.median_seconds),
          p90: toNum(first?.p90_seconds),
          max: toNum(first?.max_seconds),
          count: Number(first?.total_count ?? 0) || 0,
        });
      } catch (e) {
        console.error('useServiceWorstResponses error:', e);
        if (!cancelled) {
          setRows([]);
          setStats({ median: null, p90: null, max: null, count: 0 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, organizationId, ownerId, kind, limit, from.getTime(), to.getTime()]);

  return { rows, stats, loading };
}

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPagedRows } from '@/lib/fetchAllPagedRows';

export interface ServiceStats {
  contactsCount: number;
  avgFirstResponseSeconds: number | null;
  resolvedCount: number;
  totalCount: number;
  avgResponseSeconds: number | null;
}

const EMPTY: ServiceStats = {
  contactsCount: 0,
  avgFirstResponseSeconds: null,
  resolvedCount: 0,
  totalCount: 0,
  avgResponseSeconds: null,
};

interface Params {
  organizationId: string | null | undefined;
  from: Date;
  to: Date;
  /** users.id or 'all' */
  ownerId: string;
  /** Toggle to refetch (e.g. rangeKey) */
  refreshKey?: string;
}

export function useServiceStats({ organizationId, from, to, ownerId, refreshKey }: Params) {
  const [data, setData] = useState<ServiceStats>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const fromIso = from.toISOString();
        const toIso = to.toISOString();
        const owner = ownerId !== 'all' ? ownerId : null;

        // Build base threads query helper
        const threads = () => {
          let q = supabase
            .from('message_threads')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId);
          if (owner) q = q.eq('assigned_user_id', owner);
          return q;
        };

        // 1 + 4 + 2: fetch thread rows in period (contact_id + created_at + first_response_at)
        const threadRowsPromise = fetchAllPagedRows<{
          contact_id: string | null;
          created_at: string;
          first_response_at: string | null;
        }>(async (pf, pt) => {
          let q = supabase
            .from('message_threads')
            .select('contact_id, created_at, first_response_at')
            .eq('organization_id', organizationId)
            .gte('created_at', fromIso)
            .lte('created_at', toIso)
            .range(pf, pt);
          if (owner) q = q.eq('assigned_user_id', owner);
          return await q;
        });

        // 3: resolved count
        const resolvedPromise = threads().gte('resolved_at', fromIso).lte('resolved_at', toIso);

        // 5: avg response seconds across response time records in period
        const responsesPromise = fetchAllPagedRows<{ response_seconds: number | null }>(
          async (pf, pt) => {
            let q = supabase
              .from('message_response_times')
              .select('response_seconds')
              .eq('organization_id', organizationId)
              .gte('created_at', fromIso)
              .lte('created_at', toIso)
              .range(pf, pt);
            if (owner) q = q.eq('user_id', owner);
            return await q;
          },
        );

        const [threadRows, resolvedRes, responses] = await Promise.all([
          threadRowsPromise,
          resolvedPromise,
          responsesPromise,
        ]);

        if (cancelled) return;

        const totalCount = threadRows.length;
        const contactIds = new Set<string>();
        const firstResponseDiffs: number[] = [];
        for (const r of threadRows) {
          if (r.contact_id) contactIds.add(r.contact_id);
          if (r.first_response_at) {
            const diff =
              (new Date(r.first_response_at).getTime() - new Date(r.created_at).getTime()) / 1000;
            if (isFinite(diff) && diff >= 0) firstResponseDiffs.push(diff);
          }
        }
        const avgFirstResponseSeconds =
          firstResponseDiffs.length > 0
            ? firstResponseDiffs.reduce((a, b) => a + b, 0) / firstResponseDiffs.length
            : null;

        const respValues = responses
          .map((r) => Number(r.response_seconds))
          .filter((n) => isFinite(n) && n >= 0);
        const avgResponseSeconds =
          respValues.length > 0 ? respValues.reduce((a, b) => a + b, 0) / respValues.length : null;

        setData({
          contactsCount: contactIds.size,
          avgFirstResponseSeconds,
          resolvedCount: resolvedRes.count || 0,
          totalCount,
          avgResponseSeconds,
        });
      } catch (e) {
        console.error('useServiceStats error:', e);
        if (!cancelled) setData(EMPTY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, ownerId, refreshKey]);

  return { data, loading };
}

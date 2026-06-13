import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPagedRows } from '@/lib/fetchAllPagedRows';
import { SERVICE_MODULE_START_ISO, SERVICE_MODULE_START_MS } from '@/lib/serviceCutoff';

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

        // 1 + 4: fetch thread rows in period (id + contact_id + created_at)
        const threadRowsPromise = fetchAllPagedRows<{
          id: string;
          contact_id: string | null;
          created_at: string;
        }>(async (pf, pt) => {
          let q = supabase
            .from('message_threads')
            .select('id, contact_id, created_at')
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
        for (const r of threadRows) {
          if (r.contact_id) contactIds.add(r.contact_id);
        }

        // First response per thread derived from message_response_times
        // (column message_threads.first_response_at is not populated).
        const threadIds = threadRows.map((r) => r.id);
        const firstByThread = new Map<string, { inbound_at: string; response_seconds: number | null }>();
        const CHUNK = 300;
        for (let i = 0; i < threadIds.length; i += CHUNK) {
          const slice = threadIds.slice(i, i + CHUNK);
          if (slice.length === 0) continue;
          const rows = await fetchAllPagedRows<{
            thread_id: string;
            inbound_at: string;
            response_seconds: number | null;
          }>(async (pf, pt) => {
            let q = supabase
              .from('message_response_times')
              .select('thread_id, inbound_at, response_seconds')
              .eq('organization_id', organizationId)
              .in('thread_id', slice)
              .range(pf, pt);
            if (owner) q = q.eq('user_id', owner);
            return await q;
          });
          for (const r of rows) {
            const prev = firstByThread.get(r.thread_id);
            if (!prev || new Date(r.inbound_at).getTime() < new Date(prev.inbound_at).getTime()) {
              firstByThread.set(r.thread_id, { inbound_at: r.inbound_at, response_seconds: r.response_seconds });
            }
          }
        }
        const firstValues: number[] = [];
        firstByThread.forEach((v) => {
          const n = Number(v.response_seconds);
          if (isFinite(n) && n >= 0) firstValues.push(n);
        });
        const avgFirstResponseSeconds =
          firstValues.length > 0 ? firstValues.reduce((a, b) => a + b, 0) / firstValues.length : null;

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

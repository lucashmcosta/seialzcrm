import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SERVICE_MODULE_START_ISO, SERVICE_MODULE_START_MS } from '@/lib/serviceCutoff';

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

const percentile = (sortedAsc: number[], p: number): number | null => {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor((p / 100) * sortedAsc.length)));
  return sortedAsc[idx];
};

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

        // Fetch up to 5000 response rows in the period; enough for stats + top-N.
        let q = supabase
          .from('message_response_times')
          .select('id, thread_id, user_id, inbound_at, outbound_at, response_seconds')
          .eq('organization_id', organizationId)
          .gte('created_at', fromIso)
          .lte('created_at', toIso)
          .gte('inbound_at', SERVICE_MODULE_START_ISO)
          .order('response_seconds', { ascending: false })
          .limit(5000);
        if (owner) q = q.eq('user_id', owner);

        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;

        const all = (data || []).filter((r) => {
          const n = Number(r.response_seconds);
          if (!isFinite(n) || n < 0) return false;
          const ms = new Date(r.inbound_at).getTime();
          return isFinite(ms) && ms >= SERVICE_MODULE_START_MS;
        });

        // Build list per kind
        let pool: typeof all;
        if (kind === 'first') {
          // For each thread, keep only the earliest inbound (≥ cutoff)
          const firstByThread = new Map<string, typeof all[number]>();
          for (const r of all) {
            const prev = firstByThread.get(r.thread_id);
            if (!prev || new Date(r.inbound_at).getTime() < new Date(prev.inbound_at).getTime()) {
              firstByThread.set(r.thread_id, r);
            }
          }
          pool = Array.from(firstByThread.values());
        } else {
          pool = all;
        }

        const values = pool
          .map((r) => Number(r.response_seconds))
          .sort((a, b) => a - b);
        const median = percentile(values, 50);
        const p90 = percentile(values, 90);
        const max = values.length ? values[values.length - 1] : null;

        const top = [...pool]
          .sort((a, b) => Number(b.response_seconds) - Number(a.response_seconds))
          .slice(0, limit);

        // Enrich
        const threadIds = Array.from(new Set(top.map((r) => r.thread_id))).filter(Boolean);
        const userIds = Array.from(new Set(top.map((r) => r.user_id).filter(Boolean))) as string[];

        const threadsMap = new Map<string, string | null>();
        if (threadIds.length > 0) {
          const { data: tdata } = await supabase
            .from('message_threads')
            .select('id, contact_id')
            .in('id', threadIds);
          for (const t of tdata || []) threadsMap.set(t.id, t.contact_id);
        }
        const contactIds = Array.from(
          new Set(Array.from(threadsMap.values()).filter(Boolean) as string[]),
        );
        const contactsMap = new Map<string, string | null>();
        if (contactIds.length > 0) {
          const { data: cdata } = await supabase
            .from('contacts')
            .select('id, name')
            .in('id', contactIds);
          for (const c of cdata || []) contactsMap.set(c.id, c.name);
        }
        const usersMap = new Map<string, string | null>();
        if (userIds.length > 0) {
          const { data: udata } = await supabase
            .from('users')
            .select('id, full_name')
            .in('id', userIds);
          for (const u of udata || []) usersMap.set(u.id, u.full_name);
        }

        const enriched: WorstResponseRow[] = top.map((r) => {
          const contact_id = threadsMap.get(r.thread_id) ?? null;
          return {
            id: r.id,
            thread_id: r.thread_id,
            contact_id,
            contact_name: contact_id ? contactsMap.get(contact_id) ?? null : null,
            user_id: r.user_id,
            user_name: r.user_id ? usersMap.get(r.user_id) ?? null : null,
            inbound_at: r.inbound_at,
            outbound_at: r.outbound_at,
            response_seconds: Number(r.response_seconds),
          };
        });

        if (cancelled) return;
        setRows(enriched);
        setStats({ median, p90, max, count: pool.length });
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
  }, [enabled, organizationId, ownerId, kind, from.getTime(), to.getTime()]);

  return { rows, stats, loading };
}

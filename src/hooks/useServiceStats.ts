import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SERVICE_MODULE_START_ISO } from '@/lib/serviceCutoff';

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
        const fromIsoRaw = from.toISOString();
        const toIso = to.toISOString();
        const fromIso = fromIsoRaw < SERVICE_MODULE_START_ISO ? SERVICE_MODULE_START_ISO : fromIsoRaw;
        const owner = ownerId !== 'all' ? ownerId : null;

        const { data: rows, error } = await supabase.rpc('get_service_dashboard_stats', {
          p_org: organizationId,
          p_from: fromIso,
          p_to: toIso,
          p_owner: owner,
        });
        if (error) throw error;
        if (cancelled) return;

        const r = Array.isArray(rows) ? rows[0] : rows;
        const toNum = (v: unknown): number | null => {
          if (v == null) return null;
          const n = Number(v);
          return isFinite(n) ? n : null;
        };

        setData({
          contactsCount: Number(r?.contacts_count ?? 0) || 0,
          avgFirstResponseSeconds: toNum(r?.avg_first_response_seconds),
          resolvedCount: Number(r?.resolved_count ?? 0) || 0,
          totalCount: Number(r?.total_count ?? 0) || 0,
          avgResponseSeconds: toNum(r?.avg_response_seconds),
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

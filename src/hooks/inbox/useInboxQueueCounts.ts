import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchInboxScopedCounts, type ScopedCounts } from './inboxScope';

export type InboxQueueCounts = ScopedCounts;

const ZERO: ScopedCounts = { active: 0, waiting: 0, resolved_today: 0 };

export function useInboxQueueCounts(
  internalUserId: string | null,
  onlyMine: boolean,
  orgTimezone: string | null,
  organizationId: string | null,
  csIncludesServiceEndpoints: boolean = false,
) {
  const [counts, setCounts] = useState<ScopedCounts>(ZERO);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const c = await fetchInboxScopedCounts({ internalUserId, onlyMine, orgTimezone, organizationId, csIncludesServiceEndpoints });
    setCounts(c);
    setLoading(false);
  }, [internalUserId, onlyMine, orgTimezone, organizationId, csIncludesServiceEndpoints]);

  useEffect(() => { refresh(); }, [refresh]);

  // Debounced refresh to coalesce rapid-fire calls (e.g. user toggling status
  // on multiple threads, or many realtime events at once).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshDebounced = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { refresh(); }, 1500);
  }, [refresh]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return { counts, loading, refresh, refreshDebounced };
}

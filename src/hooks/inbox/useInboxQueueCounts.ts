import { useEffect, useState, useCallback } from 'react';
import { fetchInboxScopedCounts, type ScopedCounts } from './inboxScope';

export type InboxQueueCounts = ScopedCounts;

const ZERO: ScopedCounts = { active: 0, waiting: 0, resolved_today: 0 };

export function useInboxQueueCounts(
  internalUserId: string | null,
  onlyMine: boolean,
  orgTimezone: string | null,
) {
  const [counts, setCounts] = useState<ScopedCounts>(ZERO);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const c = await fetchInboxScopedCounts({ internalUserId, onlyMine, orgTimezone });
    setCounts(c);
    setLoading(false);
  }, [internalUserId, onlyMine, orgTimezone]);

  useEffect(() => { refresh(); }, [refresh]);

  return { counts, loading, refresh };
}

import { useCallback, useEffect, useState } from 'react';

/**
 * useHiddenThreads
 * Local-only "hide conversation from my list" feature.
 * Persists per-user via localStorage. A hidden thread reappears automatically
 * when a new inbound message arrives after the hide timestamp.
 */

type HiddenMap = Record<string, number>; // threadId -> hiddenAt (ms)

const storageKey = (userId?: string | null) => `hidden_threads_${userId || 'anon'}`;

function readMap(userId?: string | null): HiddenMap {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(userId: string | null | undefined, map: HiddenMap) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export function useHiddenThreads(userId?: string | null) {
  const [hiddenMap, setHiddenMap] = useState<HiddenMap>(() => readMap(userId));

  // Reload when user changes
  useEffect(() => {
    setHiddenMap(readMap(userId));
  }, [userId]);

  const hideThread = useCallback(
    (threadId: string) => {
      setHiddenMap((prev) => {
        const next = { ...prev, [threadId]: Date.now() };
        writeMap(userId, next);
        return next;
      });
    },
    [userId]
  );

  const unhideThread = useCallback(
    (threadId: string) => {
      setHiddenMap((prev) => {
        if (!(threadId in prev)) return prev;
        const next = { ...prev };
        delete next[threadId];
        writeMap(userId, next);
        return next;
      });
    },
    [userId]
  );

  /**
   * isHidden
   * A thread is considered hidden only if it has a stored hiddenAt
   * and no inbound message has arrived after that timestamp.
   */
  const isHidden = useCallback(
    (threadId: string, lastInboundAt?: string | null): boolean => {
      const hiddenAt = hiddenMap[threadId];
      if (!hiddenAt) return false;
      if (lastInboundAt) {
        const inboundMs = new Date(lastInboundAt).getTime();
        if (!Number.isNaN(inboundMs) && inboundMs > hiddenAt) {
          return false;
        }
      }
      return true;
    },
    [hiddenMap]
  );

  return { hiddenMap, hideThread, unhideThread, isHidden };
}

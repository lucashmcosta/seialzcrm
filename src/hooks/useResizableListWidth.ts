// ============================================================================
// Largura redimensionável (horizontal) da coluna de lista, persistida em
// localStorage. Apresentacional apenas — nenhum dado, query ou ordenação.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

interface Options {
  storageKey: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function useResizableListWidth({
  storageKey,
  defaultWidth = 400,
  minWidth = 320,
  maxWidth = 520,
}: Options) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return defaultWidth;
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? Number(raw) : NaN;
    if (!Number.isFinite(parsed)) return defaultWidth;
    return clamp(parsed, minWidth, maxWidth);
  });
  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  const persist = useCallback(
    (value: number) => {
      try {
        window.localStorage.setItem(storageKey, String(value));
      } catch {
        /* storage indisponível: preferência apenas em memória */
      }
    },
    [storageKey],
  );

  const startResize = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = widthRef.current;
      setIsResizing(true);

      const previousUserSelect = document.body.style.userSelect;
      const previousCursor = document.body.style.cursor;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      const onMove = (e: PointerEvent) => {
        const next = clamp(startWidth + (e.clientX - startX), minWidth, maxWidth);
        widthRef.current = next;
        setWidth(next);
      };

      const onEnd = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        document.body.style.userSelect = previousUserSelect;
        document.body.style.cursor = previousCursor;
        setIsResizing(false);
        persist(widthRef.current);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    },
    [maxWidth, minWidth, persist],
  );

  const reset = useCallback(() => {
    widthRef.current = defaultWidth;
    setWidth(defaultWidth);
    persist(defaultWidth);
  }, [defaultWidth, persist]);

  const nudge = useCallback(
    (delta: number) => {
      const next = clamp(widthRef.current + delta, minWidth, maxWidth);
      widthRef.current = next;
      setWidth(next);
      persist(next);
    },
    [maxWidth, minWidth, persist],
  );

  // Segurança: se o hook desmontar durante um drag, devolve o body ao normal.
  useEffect(
    () => () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    },
    [],
  );

  return { width, isResizing, startResize, reset, nudge, minWidth, maxWidth, defaultWidth };
}

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { WidgetContext, WidgetScreen } from './types';

interface PinnedWidgetState {
  screen: WidgetScreen;
  openKey: string | null;
  context: WidgetContext | null;
  toggle: (key: string) => void;
  close: () => void;
  setContext: (ctx: WidgetContext) => void;
}

const Ctx = createContext<PinnedWidgetState | null>(null);

/** Estado de sessão do painel fixado (não persistido; pin ≠ aberto). */
export function PinnedWidgetProvider({ screen, children }: { screen: WidgetScreen; children: ReactNode }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [context, setCtx] = useState<WidgetContext | null>(null);
  const toggle = useCallback((key: string) => setOpenKey((k) => (k === key ? null : key)), []);
  const close = useCallback(() => setOpenKey(null), []);
  const setContext = useCallback((c: WidgetContext) => {
    setCtx((prev) =>
      prev && prev.threadId === c.threadId && prev.contactId === c.contactId && prev.organizationId === c.organizationId ? prev : c,
    );
  }, []);
  const value = useMemo(() => ({ screen, openKey, context, toggle, close, setContext }), [screen, openKey, context, toggle, close, setContext]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePinnedWidget() {
  return useContext(Ctx);
}

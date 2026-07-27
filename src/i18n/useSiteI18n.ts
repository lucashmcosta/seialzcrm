import { createContext, useContext } from "react";
import type { Locale } from "./config";
import type { Namespace } from "./dictionaries";

export interface SiteI18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  tRaw: (ns: Namespace, key: string) => unknown;
}

export const SiteI18nContext = createContext<SiteI18nContextValue | null>(null);

export function useSiteI18n(): SiteI18nContextValue {
  const ctx = useContext(SiteI18nContext);
  if (!ctx) throw new Error("useSiteI18n must be used within SiteI18nProvider");
  return ctx;
}

/**
 * Açúcar por namespace. `t(key)` retorna string por padrão; use `t<T>(key)`
 * (ex.: `t<Step[]>('loop.steps')`) para valores estruturados.
 */
export function useSiteT(ns: Namespace) {
  const { tRaw, locale, setLocale } = useSiteI18n();
  function t(key: string): string;
  function t<T>(key: string): T;
  function t(key: string): unknown {
    return tRaw(ns, key);
  }
  return { locale, setLocale, t };
}

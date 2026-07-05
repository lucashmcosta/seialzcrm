import { createContext, useCallback, useContext, useEffect, useMemo, ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  DEFAULT_LOCALE,
  Locale,
  SLUG_TO_LOCALE,
  detectLocale,
  isLocaleSlug,
  persistLocale,
  swapLocaleInPath,
} from "./config";
import { Namespace, getDict, resolveKey } from "./dictionaries";

interface SiteI18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  tRaw: (ns: Namespace, key: string) => unknown;
}

const SiteI18nContext = createContext<SiteI18nContextValue | null>(null);

/**
 * Provider do site público. Deriva o locale do segmento `:locale` da URL.
 * Deve envolver TODAS as rotas `/:locale/*`.
 */
export function SiteI18nProvider({ children }: { children: ReactNode }) {
  const params = useParams<{ locale?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const locale: Locale = useMemo(() => {
    if (isLocaleSlug(params.locale)) return SLUG_TO_LOCALE[params.locale];
    return DEFAULT_LOCALE;
  }, [params.locale]);

  useEffect(() => {
    persistLocale(locale);
    // Reflete no <html lang> — Helmet também faz isso por página, mas
    // garantir aqui evita flash de idioma nas rotas legais.
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      persistLocale(next);
      const newPath = swapLocaleInPath(location.pathname, next);
      navigate(newPath + location.search + location.hash, { replace: false });
    },
    [locale, location, navigate],
  );

  const tRaw = useCallback((ns: Namespace, key: string): unknown => {
    const value = resolveKey(getDict(locale, ns), key);
    if (value === undefined) {
      const fallback = resolveKey(getDict(DEFAULT_LOCALE, ns), key);
      return fallback ?? key;
    }
    return value;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, tRaw }), [locale, setLocale, tRaw]);

  return <SiteI18nContext.Provider value={value}>{children}</SiteI18nContext.Provider>;
}

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

export { detectLocale };

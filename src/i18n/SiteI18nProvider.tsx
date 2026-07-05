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

  const t = useCallback(<T,>(ns: Namespace, key: string): T => {
    const value = resolveKey(getDict(locale, ns), key);
    if (value === undefined) {
      // Fallback silencioso para PT-BR se a chave faltar no idioma atual.
      const fallback = resolveKey(getDict(DEFAULT_LOCALE, ns), key);
      return (fallback ?? key) as T;
    }
    return value as T;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <SiteI18nContext.Provider value={value}>{children}</SiteI18nContext.Provider>;
}

export function useSiteI18n(): SiteI18nContextValue {
  const ctx = useContext(SiteI18nContext);
  if (!ctx) throw new Error("useSiteI18n must be used within SiteI18nProvider");
  return ctx;
}

/** Açúcar: hook por namespace (equivalente a `useTranslation('home')`). */
export function useSiteT(ns: Namespace) {
  const { t, locale, setLocale } = useSiteI18n();
  return {
    locale,
    setLocale,
    t: <T = string,>(key: string) => t<T>(ns, key),
  };
}

export { detectLocale };

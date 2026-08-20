import { useCallback, useEffect, useMemo, ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  DEFAULT_LOCALE,
  Locale,
  SLUG_TO_LOCALE,
  isLocaleSlug,
  persistLocale,
  swapLocaleInPath,
} from "./config";
import { consumeGeoRefinementPending, resolveGeoLocale } from "./geoLocale";
import { Namespace, getDict, resolveKey } from "./dictionaries";
import { SiteI18nContext } from "./useSiteI18n";


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

  // Refino por IP: o redirect da raiz é imediato (sem rede) e sinaliza aqui.
  // Se o país indicar outro idioma, trocamos a rota depois do primeiro paint.
  useEffect(() => {
    if (!consumeGeoRefinementPending()) return;
    let active = true;
    resolveGeoLocale()
      .then((geo) => {
        if (!active || !geo || geo === locale) return;
        persistLocale(geo);
        navigate(swapLocaleInPath(location.pathname, geo) + location.search + location.hash, {
          replace: true,
        });
      })
      .catch(() => { /* ignore */ });
    return () => { active = false; };
    // Roda uma única vez por montagem do site público.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



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

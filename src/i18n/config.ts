/**
 * Site institucional i18n — configuração
 *
 * Independente do i18n do CRM (`src/lib/i18n.ts`). Aqui vive somente
 * o dicionário do site público (landing + páginas legais).
 */

export const SUPPORTED_LOCALES = ["pt-BR", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pt-BR";
export const STORAGE_KEY = "seialz.site.locale";

/** URL slug (lower-case, com hífen) ↔ locale interno (BCP-47). */
export const LOCALE_TO_SLUG: Record<Locale, string> = {
  "pt-BR": "pt-br",
  en: "en",
};

export const SLUG_TO_LOCALE: Record<string, Locale> = {
  "pt-br": "pt-BR",
  en: "en",
};

export const OG_LOCALE: Record<Locale, string> = {
  "pt-BR": "pt_BR",
  en: "en_US",
};

export const HREFLANG: Record<Locale, string> = {
  "pt-BR": "pt-BR",
  en: "en",
};

export function isLocaleSlug(slug: string | undefined): slug is keyof typeof SLUG_TO_LOCALE {
  return !!slug && slug in SLUG_TO_LOCALE;
}

/** Ordem de detecção: localStorage → navigator.language → default. */
export function detectLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
      return stored as Locale;
    }
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || "").toLowerCase();
  if (nav.startsWith("en")) return "en";
  return DEFAULT_LOCALE;
}

export function persistLocale(locale: Locale) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

/** Substitui o primeiro segmento de path pelo slug do novo locale. */
export function swapLocaleInPath(pathname: string, locale: Locale): string {
  const parts = pathname.split("/").filter(Boolean);
  const newSlug = LOCALE_TO_SLUG[locale];
  if (parts.length === 0) return `/${newSlug}`;
  if (parts[0] in SLUG_TO_LOCALE) {
    parts[0] = newSlug;
  } else {
    parts.unshift(newSlug);
  }
  return "/" + parts.join("/");
}

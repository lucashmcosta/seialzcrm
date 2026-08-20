/**
 * Detecção de idioma padrão da home por IP (geo).
 *
 * Ordem de prioridade:
 *   1. Preferência salva (localStorage) — escolha explícita do usuário sempre vence.
 *   2. País do IP (lookup leve, com timeout curto).
 *   3. navigator.language.
 *   4. DEFAULT_LOCALE.
 *
 * Usado APENAS no redirect da raiz ("/") para escolher o slug inicial.
 * Nenhuma rota já com locale explícito é afetada.
 */
import { DEFAULT_LOCALE, Locale, STORAGE_KEY, SUPPORTED_LOCALES, detectLocale } from "./config";

const GEO_CACHE_KEY = "seialz.site.geoLocale";
const TIMEOUT_MS = 1200;

/** Países lusófonos → pt-BR. Qualquer outro país → en. */
const PT_COUNTRIES = new Set(["BR", "PT", "AO", "MZ", "CV", "GW", "ST", "TL"]);

function storedPreference(): Locale | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
      return stored as Locale;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function cachedGeoLocale(): Locale | null {
  try {
    const cached = window.sessionStorage.getItem(GEO_CACHE_KEY);
    if (cached && (SUPPORTED_LOCALES as readonly string[]).includes(cached)) {
      return cached as Locale;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function cacheGeoLocale(locale: Locale) {
  try {
    window.sessionStorage.setItem(GEO_CACHE_KEY, locale);
  } catch {
    /* ignore */
  }
}

function localeFromCountry(country: string | null | undefined): Locale | null {
  if (!country) return null;
  return PT_COUNTRIES.has(country.toUpperCase()) ? "pt-BR" : "en";
}

async function fetchCountry(signal: AbortSignal): Promise<string | null> {
  // Cloudflare trace é leve e não exige chave; ipapi.co é o fallback.
  try {
    const res = await fetch("https://www.cloudflare.com/cdn-cgi/trace", { signal });
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/^loc=([A-Z]{2})$/m);
      if (match) return match[1];
    }
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch("https://ipapi.co/json/", { signal });
    if (res.ok) {
      const json = (await res.json()) as { country_code?: string; country?: string };
      return json.country_code ?? json.country ?? null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Resolve o locale inicial. Nunca lança e nunca demora mais que TIMEOUT_MS:
 * em qualquer falha cai no comportamento anterior (`detectLocale`).
 */
export async function resolveInitialLocale(): Promise<Locale> {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  const explicit = storedPreference();
  if (explicit) return explicit;

  const cached = cachedGeoLocale();
  if (cached) return cached;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const country = await fetchCountry(controller.signal);
    const geo = localeFromCountry(country);
    if (geo) {
      cacheGeoLocale(geo);
      return geo;
    }
  } finally {
    window.clearTimeout(timer);
  }

  return detectLocale();
}

/**
 * Canonical URLs for public legal pages. PT usa slugs em português no
 * top-level; EN mantém o prefixo /en/ do site institucional.
 *
 * Estas URLs precisam ser estáveis pois são registradas no painel da
 * Meta (Privacy Policy / Terms of Service / Data Deletion).
 */
import type { Locale } from "@/i18n/config";

export type LegalPage = "privacy-policy" | "terms-of-service" | "data-deletion";

export const LEGAL_ROUTES: Record<LegalPage, Record<Locale, string>> = {
  "privacy-policy": {
    "pt-BR": "/politica-de-privacidade",
    en: "/en/privacy-policy",
  },
  "terms-of-service": {
    "pt-BR": "/termos-de-servico",
    en: "/en/terms-of-service",
  },
  "data-deletion": {
    "pt-BR": "/exclusao-de-dados",
    en: "/en/data-deletion",
  },
};

export function getLegalUrl(page: LegalPage, locale: Locale): string {
  return LEGAL_ROUTES[page][locale];
}

export function otherLocale(locale: Locale): Locale {
  return locale === "pt-BR" ? "en" : "pt-BR";
}

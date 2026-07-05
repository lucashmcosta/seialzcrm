import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { HREFLANG, LOCALE_TO_SLUG, Locale, OG_LOCALE, SUPPORTED_LOCALES } from "@/i18n/config";

interface SiteSeoProps {
  locale: Locale;
  title: string;
  description: string;
  /** Caminho da página SEM o prefixo do locale, começando com `/` ou vazio para a home. Ex.: `/privacy-policy`. */
  pathWithoutLocale: string;
  /**
   * Sobrescreve o caminho canônico. Útil para páginas legais que usam URLs
   * top-level em PT (ex.: `/politica-de-privacidade`) em vez do prefixo /pt-br/.
   */
  canonicalPath?: string;
  /**
   * Sobrescreve o mapa de alternates hreflang: `{ [locale]: absolutePath }`.
   * Caminhos devem começar com `/`. Quando omitido, usa o padrão baseado em
   * pathWithoutLocale + LOCALE_TO_SLUG.
   */
  alternates?: Partial<Record<Locale, string>>;
}

const SITE_ORIGIN = "https://seialz.com";

export function SiteSeo({ locale, title, description, pathWithoutLocale, canonicalPath, alternates }: SiteSeoProps) {
  const location = useLocation();
  const suffix = pathWithoutLocale || derivePathSuffix(location.pathname);

  const canonical = canonicalPath
    ? `${SITE_ORIGIN}${canonicalPath}`
    : `${SITE_ORIGIN}/${LOCALE_TO_SLUG[locale]}${suffix}`;

  const altFor = (l: Locale): string => {
    const override = alternates?.[l];
    if (override) return `${SITE_ORIGIN}${override}`;
    return `${SITE_ORIGIN}/${LOCALE_TO_SLUG[l]}${suffix}`;
  };

  return (
    <Helmet>
      <html lang={locale} />
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {SUPPORTED_LOCALES.map((l) => (
        <link key={l} rel="alternate" hrefLang={HREFLANG[l]} href={altFor(l)} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={altFor("pt-BR")} />

      <meta property="og:type" content="website" />
      <meta property="og:locale" content={OG_LOCALE[locale]} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />

      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  );
}

function derivePathSuffix(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const rest = parts.slice(1).join("/");
  return rest ? `/${rest}` : "";
}

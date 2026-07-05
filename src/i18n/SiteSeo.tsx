import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { HREFLANG, LOCALE_TO_SLUG, Locale, OG_LOCALE, SUPPORTED_LOCALES } from "@/i18n/config";

interface SiteSeoProps {
  locale: Locale;
  title: string;
  description: string;
  /** Caminho da página SEM o prefixo do locale, começando com `/` ou vazio para a home. Ex.: `/privacy-policy`. */
  pathWithoutLocale: string;
}

const SITE_ORIGIN = "https://seialz.com";

export function SiteSeo({ locale, title, description, pathWithoutLocale }: SiteSeoProps) {
  const location = useLocation();
  // Fallback: se pathWithoutLocale não foi calculado, deriva da URL.
  const suffix = pathWithoutLocale || derivePathSuffix(location.pathname);

  return (
    <Helmet>
      <html lang={locale} />
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={`${SITE_ORIGIN}/${LOCALE_TO_SLUG[locale]}${suffix}`} />
      {SUPPORTED_LOCALES.map((l) => (
        <link
          key={l}
          rel="alternate"
          hrefLang={HREFLANG[l]}
          href={`${SITE_ORIGIN}/${LOCALE_TO_SLUG[l]}${suffix}`}
        />
      ))}
      <link rel="alternate" hrefLang="x-default" href={`${SITE_ORIGIN}/${LOCALE_TO_SLUG["pt-BR"]}${suffix}`} />

      {/* Open Graph — sobrepõe o og:* estático de index.html para crawlers que executam JS */}
      <meta property="og:type" content="website" />
      <meta property="og:locale" content={OG_LOCALE[locale]} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={`${SITE_ORIGIN}/${LOCALE_TO_SLUG[locale]}${suffix}`} />

      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  );
}

function derivePathSuffix(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  // parts[0] é o slug do locale; o resto é o path real
  const rest = parts.slice(1).join("/");
  return rest ? `/${rest}` : "";
}

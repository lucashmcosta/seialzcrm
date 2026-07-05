import { useMemo } from "react";
import { useSiteT } from "@/i18n/SiteI18nProvider";
import { SiteSeo } from "@/i18n/SiteSeo";
import { getLegalBody, type LegalBodyKey, type Namespace } from "@/i18n/dictionaries";
import { getLegalUrl, LEGAL_ROUTES, otherLocale, type LegalPage } from "@/i18n/config";
import { extractUpdatedAt, renderLegalMarkdown } from "@/lib/renderLegalMarkdown";
import { LegalLayout } from "./LegalLayout";

interface LegalMarkdownPageProps {
  /** Identificador da página legal (usa mesmo slug em LEGAL_ROUTES e no md). */
  page: LegalPage;
  /** Namespace do dicionário JSON (title/seo). Para privacy-policy usa "privacy-policy" etc. */
  namespace: Namespace;
  /** Chave do markdown em legalBodies. Igual a `page` na prática. */
  bodyKey: LegalBodyKey;
}

export default function LegalMarkdownPage({ page, namespace, bodyKey }: LegalMarkdownPageProps) {
  const { t, locale } = useSiteT(namespace);

  const md = getLegalBody(locale, bodyKey);
  const html = useMemo(() => renderLegalMarkdown(md), [md]);
  const updatedAt = useMemo(() => extractUpdatedAt(md), [md]);

  const currentUrl = LEGAL_ROUTES[page][locale];
  const alt = otherLocale(locale);
  const altUrl = getLegalUrl(page, alt);

  return (
    <>
      <SiteSeo
        locale={locale}
        title={t("seo.title")}
        description={t("seo.description")}
        pathWithoutLocale=""
        canonicalPath={currentUrl}
        alternates={{
          [locale]: currentUrl,
          [alt]: altUrl,
        }}
      />
      <LegalLayout
        title={t("title")}
        updatedLabel={t("updatedLabel")}
        updatedAt={updatedAt}
        altLanguageUrl={altUrl}
        altLanguageLabel={alt === "en" ? "EN" : "PT"}
        currentLanguageLabel={locale === "en" ? "EN" : "PT"}
      >
        {/* Conteúdo vem de arquivos MD versionados em src/locales/*, não de input externo. */}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </LegalLayout>
    </>
  );
}

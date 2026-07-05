import { useMemo } from "react";
import { marked } from "marked";
import { useSiteT } from "@/i18n/SiteI18nProvider";
import { SiteSeo } from "@/i18n/SiteSeo";
import { getLegalBody } from "@/i18n/dictionaries";
import { LegalLayout } from "./LegalLayout";

// Configuração básica do marked: quebras simples viram <br>, GFM ligado.
marked.setOptions({ gfm: true, breaks: false });

export default function PrivacyPolicyPage() {
  const { t, locale } = useSiteT("privacy-policy");

  const html = useMemo(() => {
    const md = getLegalBody(locale, "privacy-policy");
    // Remove o H1 e a linha "Última atualização"/"Last updated" — ambos já
    // aparecem no cabeçalho renderizado por LegalLayout.
    const stripped = md
      .replace(/^#\s+[^\n]*\n+/, "")
      .replace(/^\*\*(?:Última atualização|Last updated)[^*]+\*\*\s*\n+/im, "");
    return marked.parse(stripped) as string;
  }, [locale]);

  // Tenta capturar a data de última atualização da primeira linha do MD
  // ("**Última atualização: 1º de janeiro de 2026**" / "**Last updated: ...**").
  const updatedAt = useMemo(() => {
    const md = getLegalBody(locale, "privacy-policy");
    const match = md.match(/\*\*(?:Última atualização|Last updated)[:：]\s*([^*]+)\*\*/i);
    return match?.[1]?.trim();
  }, [locale]);

  return (
    <>
      <SiteSeo
        locale={locale}
        title={t("seo.title")}
        description={t("seo.description")}
        pathWithoutLocale="/privacy-policy"
      />
      <LegalLayout title={t("title")} updatedLabel={t("updatedLabel")} updatedAt={updatedAt}>
        {/* Conteúdo vem de arquivos MD versionados em src/locales/*, não de input externo. */}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </LegalLayout>
    </>
  );
}

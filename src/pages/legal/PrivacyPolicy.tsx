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
    // Estratégia: extraímos o primeiro H1 (já renderizado no cabeçalho) e
    // convertemos o resto do markdown para HTML sanitizado pelo próprio
    // markdown-it/marked (não usamos innerHTML de fonte externa — o conteúdo
    // vem de arquivos versionados no repositório).
    const withoutH1 = md.replace(/^#\s+[^\n]*\n+/, "");
    return marked.parse(withoutH1) as string;
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

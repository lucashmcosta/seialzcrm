import { useSiteT } from "@/i18n/SiteI18nProvider";
import { SiteSeo } from "@/i18n/SiteSeo";
import { LegalLayout } from "./LegalLayout";

export default function TermsOfServicePage() {
  const { t, locale } = useSiteT("terms");

  return (
    <>
      <SiteSeo
        locale={locale}
        title={t("seo.title")}
        description={t("seo.description")}
        pathWithoutLocale="/terms-of-service"
      />
      <LegalLayout title={t("title")} updatedLabel={t("updatedLabel")} updatedAt={t("updatedAt")}>
        <p>{t("placeholder")}</p>
      </LegalLayout>
    </>
  );
}

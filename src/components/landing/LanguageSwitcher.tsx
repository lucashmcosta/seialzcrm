import { useSiteI18n } from "@/i18n/SiteI18nProvider";
import { LOCALE_TO_SLUG, Locale, SUPPORTED_LOCALES } from "@/i18n/config";

interface LanguageSwitcherProps {
  variant?: "navbar" | "footer";
  /** Cor do idioma inativo. */
  inactiveColor?: string;
  /** Cor do idioma ativo (destaque). */
  activeColor?: string;
}

const LABELS: Record<Locale, string> = { "pt-BR": "PT", en: "EN" };

export function LanguageSwitcher({
  variant = "navbar",
  inactiveColor = "#7A7E7A",
  activeColor = "#32CD32",
}: LanguageSwitcherProps) {
  const { locale, setLocale } = useSiteI18n();

  return (
    <div
      className={
        variant === "navbar"
          ? "inline-flex items-center gap-1 text-[13px] font-medium select-none"
          : "inline-flex items-center gap-1 text-sm select-none"
      }
      style={{ fontFamily: "'Sora', sans-serif" }}
      aria-label="Language selector"
    >
      {SUPPORTED_LOCALES.map((l, i) => {
        const active = l === locale;
        return (
          <span key={l} className="inline-flex items-center">
            {i > 0 && (
              <span aria-hidden className="mx-1" style={{ color: inactiveColor, opacity: 0.6 }}>
                |
              </span>
            )}
            <button
              type="button"
              onClick={() => setLocale(l)}
              aria-current={active ? "true" : undefined}
              aria-label={`Switch to ${LABELS[l]} (${LOCALE_TO_SLUG[l]})`}
              className="transition-colors"
              style={{
                color: active ? activeColor : inactiveColor,
                fontWeight: active ? 700 : 500,
                letterSpacing: "0.5px",
                cursor: active ? "default" : "pointer",
              }}
            >
              {LABELS[l]}
            </button>
          </span>
        );
      })}
    </div>
  );
}

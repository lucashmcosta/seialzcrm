import { Link } from 'react-router-dom';
import logoBlack from '@/assets/brand/seialz-logo-color.png.asset.json';
import { useSiteT } from '@/i18n/SiteI18nProvider';
import { LOCALE_TO_SLUG } from '@/i18n/config';
import { LanguageSwitcher } from './LanguageSwitcher';

const SNOW = '#F6F7F6';
const LINE = '#E6E8E6';
const ASH = '#7A7E7A';
const GREEN = '#32CD32';

export function LandingFooter() {
  const { t, locale } = useSiteT('common');
  const slug = LOCALE_TO_SLUG[locale];

  const linkStyle = { color: ASH, transition: 'color 0.2s ease' } as const;
  const onEnter = (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.color = GREEN;
  };
  const onLeave = (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.color = ASH;
  };

  return (
    <footer
      style={{
        backgroundColor: SNOW,
        borderTop: `1px solid ${LINE}`,
        fontFamily: "'Sora', sans-serif",
      }}
      className="py-10"
    >
      <div className="max-w-7xl mx-auto px-6 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Link to={`/${slug}`} aria-label="Seialz">
            <img src={logoBlack.url} alt="Seialz" style={{ height: 28, width: 'auto', display: 'block' }} />
          </Link>
          <p className="text-sm" style={{ color: ASH }}>
            {t('footer.tagline')} · © {new Date().getFullYear()}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm" style={{ color: ASH }}>
          <Link
            to={`/${slug}/privacy-policy`}
            style={linkStyle}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
          >
            {t('footer.privacy')}
          </Link>
          <Link
            to={`/${slug}/terms-of-service`}
            style={linkStyle}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
          >
            {t('footer.terms')}
          </Link>
          <a
            href={`/${slug}#cta`}
            style={linkStyle}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
          >
            {t('footer.contact')}
          </a>
          <span aria-hidden style={{ color: LINE }}>·</span>
          <LanguageSwitcher variant="footer" />
        </div>
      </div>
    </footer>
  );
}

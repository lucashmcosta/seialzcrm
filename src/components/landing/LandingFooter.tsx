import logoBlack from '@/assets/brand/seialz-logo-color.png.asset.json';

const SNOW = '#F6F7F6';
const LINE = '#E6E8E6';
const ASH = '#7A7E7A';
const GREEN = '#32CD32';

export function LandingFooter() {
  return (
    <footer
      style={{
        backgroundColor: SNOW,
        borderTop: `1px solid ${LINE}`,
        fontFamily: "'Sora', sans-serif",
      }}
      className="py-12"
    >
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <img src={logoBlack.url} alt="Seialz" style={{ height: 28, width: 'auto', display: 'block' }} />
        <p className="text-sm" style={{ color: ASH }}>
          Sales Ops Nativo · © {new Date().getFullYear()}
        </p>
        <div className="flex gap-6 text-sm" style={{ color: ASH }}>
          <a
            href="#"
            className="transition-colors"
            onMouseEnter={(e) => (e.currentTarget.style.color = GREEN)}
            onMouseLeave={(e) => (e.currentTarget.style.color = ASH)}
          >
            Termos
          </a>
          <a
            href="#"
            className="transition-colors"
            onMouseEnter={(e) => (e.currentTarget.style.color = GREEN)}
            onMouseLeave={(e) => (e.currentTarget.style.color = ASH)}
          >
            Privacidade
          </a>
        </div>
      </div>
    </footer>
  );
}

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import logoBlack from '@/assets/brand/seialz-logo-color.png.asset.json';
import { List, X } from '@phosphor-icons/react';

const navLinks = [
  { label: 'O Problema', href: '#problema' },
  { label: 'Solução', href: '#solucao' },
  { label: 'O Loop', href: '#loop' },
];

const INK = '#0A0A0A';
const SOFT = '#4A4D4A';
const GREEN = '#32CD32';
const LINE = '#E6E8E6';

export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
      const ctaSection = document.getElementById('cta');
      if (ctaSection) {
        const rect = ctaSection.getBoundingClientRect();
        setCtaVisible(rect.top < window.innerHeight);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (href: string) => {
    setMobileOpen(false);
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          backgroundColor: scrolled ? 'rgba(255,255,255,0.86)' : 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: scrolled ? `1px solid ${LINE}` : '1px solid transparent',
          fontFamily: "'Sora', sans-serif",
        }}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" aria-label="Seialz" className="flex items-center">
            <img
              src={logoBlack.url}
              alt="Seialz"
              style={{ height: 32, width: 'auto', display: 'block', imageRendering: 'auto' }}
            />
          </Link>

          {/* Desktop links */}
          <div className="hidden lg:flex items-center gap-7">
            {navLinks.map((l) => (
              <button
                key={l.href}
                onClick={() => scrollTo(l.href)}
                className="text-[13px] uppercase font-medium transition-colors"
                style={{ color: SOFT, letterSpacing: '1.5px' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = GREEN)}
                onMouseLeave={(e) => (e.currentTarget.style.color = SOFT)}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/auth/signin"
              className="text-sm font-medium transition-colors"
              style={{ color: INK }}
            >
              Entrar
            </Link>
            <button
              onClick={() => scrollTo('#cta')}
              className="hidden md:inline-flex px-5 py-2 rounded-[10px] text-sm font-bold transition-all hover:scale-105"
              style={{ backgroundColor: GREEN, color: INK }}
            >
              Falar com a Seialz
            </button>
            <button
              className="lg:hidden ml-2"
              style={{ color: INK }}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Menu"
            >
              {mobileOpen ? <X size={22} /> : <List size={22} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div
            className="lg:hidden px-6 pb-6 pt-2"
            style={{
              backgroundColor: 'rgba(255,255,255,0.96)',
              backdropFilter: 'blur(14px)',
              borderTop: `1px solid ${LINE}`,
            }}
          >
            {navLinks.map((l) => (
              <button
                key={l.href}
                onClick={() => scrollTo(l.href)}
                className="block w-full text-left py-3 text-sm uppercase font-medium transition-colors"
                style={{ color: SOFT, letterSpacing: '1.5px' }}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
      </nav>

      {scrolled && !ctaVisible && (
        <div className="md:hidden fixed bottom-6 left-4 right-4 z-50">
          <button
            onClick={() => scrollTo('#cta')}
            className="w-full py-3.5 rounded-[10px] text-sm font-bold transition-all"
            style={{
              backgroundColor: GREEN,
              color: INK,
              fontFamily: "'Sora', sans-serif",
              boxShadow: '0 8px 28px rgba(50,205,50,0.35)',
            }}
          >
            FALAR COM A SEIALZ
          </button>
        </div>
      )}
    </>
  );
}

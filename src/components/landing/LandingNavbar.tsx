import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SeialzLogo } from '@/components/SeialzLogo';
import { Menu, X } from 'lucide-react';

const navLinks = [
  { label: 'O Problema', href: '#problema' },
  { label: 'Solução', href: '#solucao' },
  { label: 'Pra Quem', href: '#pra-quem' },
  { label: 'Incluso', href: '#incluso' },
  { label: 'Como Funciona', href: '#como-funciona' },
  { label: 'Resultados', href: '#resultados' },
];

export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (href: string) => {
    setMobileOpen(false);
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[hsl(240,10%,4%)]/90 backdrop-blur-xl border-b border-[hsl(150,100%,50%)]/10'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <SeialzLogo size="md" theme="dark" animated={true} />

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-6">
          {navLinks.map((l) => (
            <button
              key={l.href}
              onClick={() => scrollTo(l.href)}
              className="text-sm text-[hsl(0,0%,60%)] hover:text-[hsl(150,100%,50%)] transition-colors font-['Outfit']"
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/auth/signin"
            className="text-sm text-[hsl(0,0%,80%)] hover:text-white transition-colors font-['Outfit']"
          >
            Entrar
          </Link>
          <button
            onClick={() => scrollTo('#cta')}
            className="auth-btn-primary px-5 py-2 rounded-full text-sm font-semibold font-['Outfit'] transition-all hover:shadow-[0_0_20px_hsl(150,100%,50%,0.3)]"
          >
            Agendar Diagnóstico
          </button>
          <button
            className="lg:hidden text-white ml-2"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-[hsl(240,10%,4%)]/95 backdrop-blur-xl border-t border-[hsl(150,100%,50%)]/10 px-6 pb-6 pt-2">
          {navLinks.map((l) => (
            <button
              key={l.href}
              onClick={() => scrollTo(l.href)}
              className="block w-full text-left py-3 text-[hsl(0,0%,60%)] hover:text-[hsl(150,100%,50%)] transition-colors font-['Outfit']"
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}

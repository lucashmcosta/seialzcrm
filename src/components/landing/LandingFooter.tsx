import logoWhite from '@/assets/brand/seialz-logo-white.svg.asset.json';

export function LandingFooter() {
  return (
    <footer className="bg-[hsl(240,10%,3%)] border-t border-[hsl(120,61%,50%)]/10 py-12">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <img src={logoWhite.url} alt="Seialz" className="h-6 w-auto" />
        <p className="text-sm text-[hsl(0,0%,40%)] font-['Sora']">
          Sales Ops Nativo · © {new Date().getFullYear()}
        </p>
        <div className="flex gap-6 text-sm text-[hsl(0,0%,40%)] font-['Sora']">
          <a href="#" className="hover:text-[hsl(120,61%,50%)] transition-colors">Termos</a>
          <a href="#" className="hover:text-[hsl(120,61%,50%)] transition-colors">Privacidade</a>
        </div>
      </div>
    </footer>
  );
}

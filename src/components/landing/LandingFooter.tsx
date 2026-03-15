import { SeialzLogo } from '@/components/SeialzLogo';

export function LandingFooter() {
  return (
    <footer className="bg-[hsl(240,10%,3%)] border-t border-[hsl(150,100%,50%)]/10 py-12">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <SeialzLogo size="sm" theme="dark" animated={false} />
        <p className="text-sm text-[hsl(0,0%,40%)] font-['Outfit']">
          © {new Date().getFullYear()} Seialz. Todos os direitos reservados.
        </p>
        <div className="flex gap-6 text-sm text-[hsl(0,0%,40%)] font-['Outfit']">
          <a href="#" className="hover:text-[hsl(150,100%,50%)] transition-colors">Termos</a>
          <a href="#" className="hover:text-[hsl(150,100%,50%)] transition-colors">Privacidade</a>
        </div>
      </div>
    </footer>
  );
}

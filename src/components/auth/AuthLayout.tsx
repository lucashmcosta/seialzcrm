import { motion } from 'framer-motion';
import { Zap, BarChart3, Shield } from 'lucide-react';
import seialzLogo from '@/assets/seialz-logo-green.png';

const features = [
  { icon: Zap, text: 'Automação inteligente de vendas' },
  { icon: BarChart3, text: 'Relatórios e métricas em tempo real' },
  { icon: Shield, text: 'Segurança e conformidade total' },
];

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left Banner */}
      <div className="hidden lg:flex relative flex-col items-center justify-center overflow-hidden auth-banner-bg">
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 auth-grid-pattern" />
        
        {/* Glow effects */}
        <motion.div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, hsla(150, 100%, 50%, 0.08) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="relative z-10 flex flex-col items-center px-12 max-w-lg">
          <motion.img
            src={seialzLogo}
            alt="Seialz"
            className="w-72 mb-10"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          />

          <motion.p
            className="text-center text-lg mb-12 auth-tagline"
            style={{ fontFamily: "'Michroma', sans-serif", color: 'hsl(0, 0%, 70%)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            Do clique ao contrato fechado
          </motion.p>

          <div className="space-y-6 w-full">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                className="flex items-center gap-4"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.15, duration: 0.5 }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'hsla(150, 100%, 50%, 0.1)', border: '1px solid hsla(150, 100%, 50%, 0.2)' }}
                >
                  <feature.icon className="w-5 h-5" style={{ color: 'hsl(150, 100%, 50%)' }} />
                </div>
                <span className="text-sm" style={{ color: 'hsl(0, 0%, 65%)', fontFamily: "'Outfit', sans-serif" }}>
                  {feature.text}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Form */}
      <div className="flex flex-col items-center justify-center p-6 sm:p-10 bg-background min-h-screen">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <img src={seialzLogo} alt="Seialz" className="w-48 auth-logo-mobile" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

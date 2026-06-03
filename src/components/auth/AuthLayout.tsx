import { motion } from 'framer-motion';
import { Lightning, ChartBar, Shield } from '@phosphor-icons/react';
import logoColor from '@/assets/brand/seialz-logo-color.png.asset.json';
import linhasSutil from '@/assets/brand/linhas-sutil-light.svg.asset.json';

const GREEN = '#32CD32';
const FOREST = '#1E7A1E';
const INK = '#07100B';
const SOFT = '#4A4D4A';
const ASH = '#6B756F';

const features = [
  { icon: Lightning, text: 'Marketing e vendas sobre o mesmo dado' },
  { icon: ChartBar, text: 'Atribuição real, do clique à receita' },
  { icon: Shield, text: 'Uma fonte de verdade em tempo real' },
];

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2" style={{ fontFamily: "'Sora', sans-serif" }}>
      {/* Left Banner */}
      <div className="hidden lg:flex relative flex-col items-center justify-center overflow-hidden auth-banner-bg" style={{ borderRight: '1px solid #E6EBE7' }}>
        {/* flow lines */}
        <div
          className="absolute inset-0 pointer-events-none bg-center bg-cover"
          style={{ backgroundImage: `url(${linhasSutil.url})`, opacity: 0.5 }}
        />
        {/* soft green glow */}
        <motion.div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[520px] h-[520px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(50,205,50,0.10) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.12, 1], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="relative z-10 flex flex-col items-center px-12 max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-10"
          >
            <img src={logoColor.url} alt="Seialz" style={{ height: 44, width: 'auto', display: 'block' }} />
          </motion.div>

          <motion.p
            className="text-center text-lg mb-12 leading-relaxed"
            style={{ color: SOFT }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            Marketing e vendas, em <span style={{ color: FOREST, fontWeight: 600 }}>um único sistema.</span>
          </motion.p>

          <div className="space-y-5 w-full">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                className="flex items-center gap-4"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.12, duration: 0.5 }}
              >
                <div
                  className="w-10 h-10 flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: 'rgba(50,205,50,0.10)',
                    border: '1px solid rgba(50,205,50,0.25)',
                    borderRadius: 10,
                  }}
                >
                  <feature.icon className="w-5 h-5" style={{ color: GREEN }} weight="bold" />
                </div>
                <span className="text-sm" style={{ color: ASH }}>
                  {feature.text}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Form */}
      <div className="flex flex-col items-center justify-center p-6 sm:p-10 min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <img src={logoColor.url} alt="Seialz" style={{ height: 36, width: 'auto', display: 'block' }} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

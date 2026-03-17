import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { SeialzLogo } from '@/components/SeialzLogo';
import { motion } from 'framer-motion';
import { Eye, EyeSlash } from '@phosphor-icons/react';

export default function MobileSignIn() {
  const navigate = useNavigate();
  const { t } = useTranslation('pt-BR');
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (authData.user) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', authData.user.id)
          .maybeSingle();

        if (userError) {
          console.error('Erro ao buscar usuário:', userError);
          throw new Error('Erro ao carregar dados do usuário. Tente novamente.');
        }

        if (!userData) {
          throw new Error('Usuário não encontrado. Por favor, faça logout e tente criar uma nova conta.');
        }

        let deviceId = localStorage.getItem('seialz_device_id');
        if (!deviceId) {
          deviceId = crypto.randomUUID();
          localStorage.setItem('seialz_device_id', deviceId);
        }

        await supabase.from('user_sessions').upsert({
          user_id: userData.id,
          device_id: deviceId,
          last_seen_at: new Date().toISOString(),
          user_agent: navigator.userAgent,
        }, {
          onConflict: 'user_id,device_id'
        });

        const { data: membership } = await supabase
          .from('user_organizations')
          .select('organization_id')
          .eq('user_id', userData.id)
          .maybeSingle();

        if (membership) {
          const { data: org } = await supabase
            .from('organizations')
            .select('onboarding_step')
            .eq('id', membership.organization_id)
            .maybeSingle();

          if (org && org.onboarding_step !== 'completed') {
            navigate('/onboarding');
          } else {
            navigate('/dashboard');
          }
        }
      }
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const currencySymbols = [
    { symbol: 'R$', top: '3%', left: '8%', size: 'text-xs', opacity: 0.04, delay: 0, dir: -1 },
    { symbol: '$', top: '7%', left: '72%', size: 'text-sm', opacity: 0.05, delay: 2.1, dir: 1 },
    { symbol: '€', top: '12%', left: '40%', size: 'text-xs', opacity: 0.03, delay: 4.2, dir: -1 },
    { symbol: '£', top: '18%', left: '88%', size: 'text-base', opacity: 0.04, delay: 1.5, dir: 1 },
    { symbol: '¥', top: '24%', left: '20%', size: 'text-sm', opacity: 0.06, delay: 3.0, dir: -1 },
    { symbol: '₹', top: '30%', left: '60%', size: 'text-xs', opacity: 0.04, delay: 0.8, dir: 1 },
    { symbol: '₿', top: '35%', left: '5%', size: 'text-sm', opacity: 0.05, delay: 4.8, dir: -1 },
    { symbol: '$', top: '40%', left: '78%', size: 'text-xs', opacity: 0.03, delay: 2.5, dir: 1 },
    { symbol: 'R$', top: '46%', left: '35%', size: 'text-base', opacity: 0.05, delay: 1.0, dir: -1 },
    { symbol: '€', top: '52%', left: '92%', size: 'text-xs', opacity: 0.04, delay: 3.7, dir: 1 },
    { symbol: '£', top: '56%', left: '15%', size: 'text-sm', opacity: 0.06, delay: 0.3, dir: -1 },
    { symbol: '¥', top: '62%', left: '55%', size: 'text-xs', opacity: 0.03, delay: 4.5, dir: 1 },
    { symbol: '$', top: '68%', left: '82%', size: 'text-sm', opacity: 0.05, delay: 1.8, dir: -1 },
    { symbol: '₹', top: '73%', left: '28%', size: 'text-xs', opacity: 0.04, delay: 3.2, dir: 1 },
    { symbol: 'R$', top: '78%', left: '65%', size: 'text-base', opacity: 0.05, delay: 0.5, dir: -1 },
    { symbol: '₿', top: '84%', left: '10%', size: 'text-xs', opacity: 0.03, delay: 2.8, dir: 1 },
    { symbol: '€', top: '88%', left: '48%', size: 'text-sm', opacity: 0.04, delay: 4.0, dir: -1 },
    { symbol: '$', top: '93%', left: '85%', size: 'text-xs', opacity: 0.05, delay: 1.3, dir: 1 },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col mobile-signin-bg relative overflow-hidden">
      {/* Floating currency symbols */}
      <div className="absolute inset-0 pointer-events-none">
        {currencySymbols.map((item, i) => (
          <motion.span
            key={i}
            className={`absolute ${item.size} font-light select-none`}
            style={{
              top: item.top,
              left: item.left,
              opacity: item.opacity,
              color: 'hsl(153, 100%, 50%)',
            }}
            animate={{ y: [0, 8 * item.dir, 0] }}
            transition={{
              duration: 8 + item.delay % 3,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: item.delay,
            }}
          >
            {item.symbol}
          </motion.span>
        ))}
      </div>
      {/* Top section with logo */}
      <motion.div
        className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <SeialzLogo size="xl" theme="dark" />
      </motion.div>

      {/* Form section */}
      <motion.div
        className="px-6 pb-10 space-y-5"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="E-mail"
              autoComplete="email"
              className="mobile-input"
            />
          </div>

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Senha"
              autoComplete="current-password"
              className="mobile-input pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 mobile-signin-eye"
            >
              {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mobile-btn-primary"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                Entrando...
              </span>
            ) : (
              'Entrar'
            )}
          </button>
        </form>

        <div className="text-center pt-2">
          <span className="text-sm mobile-signin-muted">Não tem uma conta? </span>
          <button
            type="button"
            className="text-sm font-semibold mobile-signin-link"
            onClick={() => navigate('/auth/signup')}
          >
            Criar conta
          </button>
        </div>
      </motion.div>
    </div>
  );
}

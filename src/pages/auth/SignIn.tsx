import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { motion } from 'framer-motion';

export default function SignIn() {
  const navigate = useNavigate();
  const { t } = useTranslation('pt-BR');
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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

        if (userData) {
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

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: "'Michroma', sans-serif" }}>
            {t('auth.signIn')}
          </h1>
          <p className="text-muted-foreground mt-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Entre na sua conta do Seialz
          </p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-foreground">{t('auth.email')}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 rounded-xl"
              glowOnFocus={false}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium text-foreground">{t('auth.password')}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12 rounded-xl"
              glowOnFocus={false}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-50 auth-btn-primary"
          >
            {loading ? t('common.loading') : t('auth.signIn')}
          </button>

          <div className="text-center text-sm pt-2">
            <span className="text-muted-foreground">{t('auth.dontHaveAccount')} </span>
            <button
              type="button"
              className="font-semibold auth-link-green hover:underline"
              onClick={() => navigate('/auth/signup')}
            >
              {t('auth.signUp')}
            </button>
          </div>
        </form>
      </motion.div>
    </AuthLayout>
  );
}

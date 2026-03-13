import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { NameInput } from '@/components/NameInput';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { motion } from 'framer-motion';

export default function SignUp() {
  const navigate = useNavigate();
  const { t } = useTranslation('pt-BR');
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    organizationName: '',
  });

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.email || !formData.password || !formData.organizationName) {
      toast({
        title: t('common.error'),
        description: 'Por favor, preencha todos os campos.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: formData.fullName,
            organization_name: formData.organizationName,
          }
        }
      });

      if (authError) throw authError;

      toast({
        title: t('common.success'),
        description: 'Conta criada! Verifique seu email para confirmar o cadastro.',
      });

      navigate(`/auth/confirm-email?email=${encodeURIComponent(formData.email)}`);
    } catch (error: any) {
      console.error('Sign up error:', error);
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
            {t('auth.createAccount')}
          </h1>
          <p className="text-muted-foreground mt-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Crie sua conta e comece a gerenciar seus contatos
          </p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-5">
          <NameInput
            locale="pt-BR"
            fullName={formData.fullName}
            onFullNameChange={(value) => setFormData({ ...formData, fullName: value })}
            required
          />

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-foreground">{t('auth.email')}</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              minLength={6}
              className="h-12 rounded-xl"
              glowOnFocus={false}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="organizationName" className="text-sm font-medium text-foreground">{t('auth.organizationName')}</Label>
            <Input
              id="organizationName"
              type="text"
              value={formData.organizationName}
              onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
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
            {loading ? t('common.loading') : t('auth.signUp')}
          </button>

          <div className="text-center text-sm pt-2">
            <span className="text-muted-foreground">{t('auth.alreadyHaveAccount')} </span>
            <button
              type="button"
              className="font-semibold auth-link-green hover:underline"
              onClick={() => navigate('/auth/signin')}
            >
              {t('auth.signIn')}
            </button>
          </div>
        </form>
      </motion.div>
    </AuthLayout>
  );
}

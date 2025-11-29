import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { Building2 } from 'lucide-react';

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
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Check onboarding status
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (userData) {
        const { data: membership } = await supabase
          .from('user_organizations')
          .select('organization_id')
          .eq('user_id', userData.id)
          .single();

        if (membership) {
          const { data: org } = await supabase
            .from('organizations')
            .select('onboarding_step')
            .eq('id', membership.organization_id)
            .single();

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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-primary rounded-lg flex items-center justify-center">
            <Building2 className="w-10 h-10 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">{t('auth.signIn')}</CardTitle>
          <CardDescription>Entre na sua conta do Seialz</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('common.loading') : t('auth.signIn')}
            </Button>

            <div className="text-center text-sm">
              <span className="text-muted-foreground">{t('auth.dontHaveAccount')} </span>
              <Button
                type="button"
                variant="link"
                className="p-0 h-auto"
                onClick={() => navigate('/auth/signup')}
              >
                {t('auth.signUp')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
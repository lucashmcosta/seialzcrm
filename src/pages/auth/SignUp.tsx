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
import { NameInput } from '@/components/NameInput';

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
    setLoading(true);

    try {
      // Sign up the user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: formData.fullName,
          }
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        // Create organization slug from name
        const slug = formData.organizationName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        // Create user profile
        const { data: userData, error: userError } = await supabase
          .from('users')
          .insert({
            auth_user_id: authData.user.id,
            email: formData.email,
            full_name: formData.fullName,
            first_name: formData.fullName.split(' ')[0],
            last_name: formData.fullName.split(' ').slice(1).join(' ') || null,
            locale: 'pt-BR',
            timezone: 'America/Sao_Paulo',
          })
          .select()
          .single();

        if (userError) throw userError;

        // Create organization
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: formData.organizationName,
            slug: slug,
            default_currency: 'BRL',
            default_locale: 'pt-BR',
            timezone: 'America/Sao_Paulo',
            onboarding_step: 'first_contact',
          })
          .select()
          .single();

        if (orgError) throw orgError;

        // Create default permission profiles
        const { data: adminProfile, error: profileError } = await supabase
          .from('permission_profiles')
          .insert([
            {
              organization_id: orgData.id,
              name: 'Admin',
              permissions: {
                can_view_contacts: true,
                can_edit_contacts: true,
                can_delete_contacts: true,
                can_view_opportunities: true,
                can_edit_opportunities: true,
                can_delete_opportunities: true,
                can_manage_settings: true,
                can_manage_users: true,
              },
            },
            {
              organization_id: orgData.id,
              name: 'Sales Rep',
              permissions: {
                can_view_contacts: true,
                can_edit_contacts: true,
                can_view_opportunities: true,
                can_edit_opportunities: true,
              },
            },
          ])
          .select();

        if (profileError) throw profileError;

        // Create user organization membership
        const { error: membershipError } = await supabase
          .from('user_organizations')
          .insert({
            user_id: userData.id,
            organization_id: orgData.id,
            permission_profile_id: adminProfile[0].id,
            is_active: true,
          });

        if (membershipError) throw membershipError;

        // Create subscription
        const { error: subscriptionError } = await supabase
          .from('subscriptions')
          .insert({
            organization_id: orgData.id,
            plan_name: 'free',
            status: 'trialing',
            is_free_plan: true,
            max_seats: 3,
          });

        if (subscriptionError) throw subscriptionError;

        // Create default pipeline stages
        await supabase.from('pipeline_stages').insert([
          { organization_id: orgData.id, name: 'Novo', order_index: 1, type: 'custom' },
          { organization_id: orgData.id, name: 'Em negociação', order_index: 2, type: 'custom' },
          { organization_id: orgData.id, name: 'Ganho', order_index: 100, type: 'won' },
          { organization_id: orgData.id, name: 'Perdido', order_index: 101, type: 'lost' },
        ]);

        toast({
          title: t('common.success'),
          description: 'Conta criada com sucesso!',
        });

        navigate('/onboarding');
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
          <CardTitle className="text-2xl">{t('auth.createAccount')}</CardTitle>
          <CardDescription>Crie sua conta e comece a gerenciar seus contatos</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignUp} className="space-y-4">
            <NameInput
              locale="pt-BR"
              fullName={formData.fullName}
              onFullNameChange={(value) => setFormData({ ...formData, fullName: value })}
              required
            />

            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="organizationName">{t('auth.organizationName')}</Label>
              <Input
                id="organizationName"
                type="text"
                value={formData.organizationName}
                onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('common.loading') : t('auth.signUp')}
            </Button>

            <div className="text-center text-sm">
              <span className="text-muted-foreground">{t('auth.alreadyHaveAccount')} </span>
              <Button
                type="button"
                variant="link"
                className="p-0 h-auto"
                onClick={() => navigate('/auth/signin')}
              >
                {t('auth.signIn')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Building2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';

interface Invitation {
  id: string;
  email: string;
  organization_id: string;
  permission_profile_id: string;
  status: string;
  organizations: {
    name: string;
  };
}

export default function AcceptInvitation() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation('pt-BR');

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Form states for new account creation
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (token) {
      fetchInvitation();
    }
  }, [token]);

  const fetchInvitation = async () => {
    if (!token) return;

    try {
      const { data, error } = await supabase
        .from('invitations')
        .select('*, organizations(name)')
        .eq('token', token)
        .eq('status', 'pending')
        .single();

      if (error || !data) {
        setError(t('invite.invalidToken'));
        setLoading(false);
        return;
      }

      setInvitation(data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching invitation:', err);
      setError(t('invite.invalidToken'));
      setLoading(false);
    }
  };

  const linkUserToOrganization = async () => {
    if (!invitation || !user) return;

    // Verificar se o email do usuário corresponde ao convite
    if (user.email !== invitation.email) {
      setError(t('invite.emailMismatch'));
      return;
    }

    try {
      // Buscar o user_id da tabela users
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (userError || !userData) throw new Error('User not found');

      // Criar user_organizations
      const { error: linkError } = await supabase
        .from('user_organizations')
        .insert({
          user_id: userData.id,
          organization_id: invitation.organization_id,
          permission_profile_id: invitation.permission_profile_id
        });

      if (linkError) throw linkError;

      // Atualizar invitation
      const { error: updateError } = await supabase
        .from('invitations')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', invitation.id);

      if (updateError) throw updateError;

      toast.success(t('invite.accepted'));
      navigate('/dashboard');
    } catch (err) {
      console.error('Error linking user:', err);
      toast.error(t('common.error'));
    }
  };

  const createAccountAndLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;

    setSubmitting(true);

    try {
      // Criar conta no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: invitation.email,
        password: password,
        options: {
          data: {
            full_name: fullName
          },
          emailRedirectTo: `${window.location.origin}/`
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('User creation failed');

      // Criar registro na tabela users
      const { data: userData, error: userError } = await supabase
        .from('users')
        .insert({
          auth_user_id: authData.user.id,
          email: invitation.email,
          full_name: fullName,
          first_name: fullName.split(' ')[0],
          last_name: fullName.split(' ').slice(1).join(' ') || null
        })
        .select()
        .single();

      if (userError || !userData) throw userError;

      // Criar user_organizations
      const { error: linkError } = await supabase
        .from('user_organizations')
        .insert({
          user_id: userData.id,
          organization_id: invitation.organization_id,
          permission_profile_id: invitation.permission_profile_id
        });

      if (linkError) throw linkError;

      // Atualizar invitation
      const { error: updateError } = await supabase
        .from('invitations')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', invitation.id);

      if (updateError) throw updateError;

      toast.success(t('invite.accepted'));
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Error creating account:', err);
      toast.error(err.message || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = () => {
    if (isAuthenticated) {
      linkUserToOrganization();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <CardTitle>{t('invite.invalidToken')}</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!invitation) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>{t('invite.title')}</CardTitle>
          <CardDescription>
            {t('invite.welcome')} <strong>{invitation.organizations.name}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isAuthenticated ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                {t('invite.loggedInAs')} <strong>{user?.email}</strong>
              </p>
              <Button
                onClick={handleAccept}
                disabled={submitting}
                className="w-full"
              >
                {submitting ? t('common.loading') : t('invite.acceptInvitation')}
              </Button>
            </div>
          ) : (
            <form onSubmit={createAccountAndLink} className="space-y-4">
              <p className="text-sm text-muted-foreground text-center mb-4">
                {t('invite.createAccount')}
              </p>
              <div>
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={invitation.email}
                  disabled
                />
              </div>
              <div>
                <Label htmlFor="fullName">{t('auth.fullName')}</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">{t('auth.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full"
              >
                {submitting ? t('common.loading') : t('invite.acceptInvitation')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

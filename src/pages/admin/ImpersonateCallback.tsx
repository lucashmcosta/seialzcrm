import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PageLoader } from '@/components/common/PageLoader';
import { Button } from '@/components/ui/button';

export default function ImpersonateCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;

    // Persist imp_session before anything else
    const params = new URLSearchParams(window.location.search);
    const impSession = params.get('imp_session');
    if (impSession) {
      localStorage.setItem('impersonation_session_id', impSession);
    }

    const routeForUser = async (authUserId: string) => {
      try {
        const { data: userRow } = await supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', authUserId)
          .maybeSingle();

        if (!userRow) {
          navigate('/dashboard', { replace: true });
          return;
        }

        const { data: membership } = await supabase
          .from('user_organizations')
          .select('organization_id')
          .eq('user_id', userRow.id)
          .maybeSingle();

        if (!membership) {
          navigate('/dashboard', { replace: true });
          return;
        }

        const { data: org } = await supabase
          .from('organizations')
          .select('onboarding_step')
          .eq('id', membership.organization_id)
          .maybeSingle();

        if (org && org.onboarding_step !== 'completed') {
          navigate('/onboarding', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      } catch (e) {
        console.error('[ImpersonateCallback] routing error', e);
        navigate('/dashboard', { replace: true });
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (done) return;
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        done = true;
        // Clean hash from URL
        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        routeForUser(session.user.id);
      }
    });

    // Also check existing session in case the event already fired
    supabase.auth.getSession().then(({ data }) => {
      if (done) return;
      if (data.session?.user) {
        done = true;
        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        routeForUser(data.session.user.id);
      }
    });

    const timeout = setTimeout(() => {
      if (!done) {
        setError('Não foi possível estabelecer a sessão. Verifique as Redirect URLs no Supabase.');
      }
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold text-foreground">Falha na impersonação</h1>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={() => (window.location.href = '/admin/organizations')}>
            Voltar ao admin
          </Button>
        </div>
      </div>
    );
  }

  return <PageLoader />;
}

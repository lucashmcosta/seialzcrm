import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Shield } from 'lucide-react';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        await supabase.rpc('record_failed_admin_login', {
          p_email: email,
          p_ip: window.location.hostname,
        });
        
        toast({
          title: 'Erro ao fazer login',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      if (data.user) {
        const { data: adminUser } = await supabase
          .from('admin_users')
          .select('*')
          .eq('auth_user_id', data.user.id)
          .single();

        if (!adminUser) {
          await supabase.auth.signOut();
          toast({
            title: 'Acesso negado',
            description: 'Esta conta não tem permissões de administrador.',
            variant: 'destructive',
          });
          return;
        }

        if (!adminUser.is_active) {
          await supabase.auth.signOut();
          toast({
            title: 'Conta desativada',
            description: 'Sua conta de administrador foi desativada.',
            variant: 'destructive',
          });
          return;
        }

        if (adminUser.locked_until && new Date(adminUser.locked_until) > new Date()) {
          await supabase.auth.signOut();
          toast({
            title: 'Conta bloqueada',
            description: 'Sua conta foi bloqueada temporariamente por excesso de tentativas de login.',
            variant: 'destructive',
          });
          return;
        }

        await supabase.rpc('reset_admin_login_attempts', {
          p_admin_id: adminUser.id,
        });

        await supabase.from('admin_audit_logs').insert({
          admin_user_id: adminUser.id,
          action: 'login',
          ip_address: window.location.hostname,
          user_agent: navigator.userAgent,
        });

        if (!adminUser.mfa_enabled) {
          navigate('/admin/mfa-setup');
        } else {
          navigate('/admin');
        }
      }
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Ocorreu um erro ao fazer login. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">Portal Admin</CardTitle>
            <CardDescription>
              Acesso exclusivo para administradores
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

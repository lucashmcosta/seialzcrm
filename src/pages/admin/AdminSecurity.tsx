import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Shield, AlertTriangle, Unlock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function AdminSecurity() {
  const [failedLogins, setFailedLogins] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [lockedAdmins, setLockedAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchSecurityData();
  }, []);

  const fetchSecurityData = async () => {
    try {
      // Failed logins
      const { data: failed } = await supabase
        .from('admin_audit_logs')
        .select(`
          *,
          admin_users (full_name, email)
        `)
        .eq('action', 'failed_login')
        .order('created_at', { ascending: false })
        .limit(50);

      // Active sessions
      const { data: sessions } = await supabase
        .from('admin_sessions')
        .select(`
          *,
          admin_users (full_name, email)
        `)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      // Locked admins
      const { data: locked } = await supabase
        .from('admin_users')
        .select('*')
        .gt('locked_until', new Date().toISOString());

      setFailedLogins(failed || []);
      setActiveSessions(sessions || []);
      setLockedAdmins(locked || []);
    } catch (error) {
      console.error('Error fetching security data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('admin_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) throw error;

      toast({
        title: 'Sessão revogada',
        description: 'A sessão foi revogada com sucesso.',
      });

      await fetchSecurityData();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Falha ao revogar sessão.',
        variant: 'destructive',
      });
    }
  };

  const handleUnlockAdmin = async (adminId: string) => {
    try {
      const { error } = await supabase
        .from('admin_users')
        .update({ 
          locked_until: null, 
          failed_login_attempts: 0 
        })
        .eq('id', adminId);

      if (error) throw error;

      toast({
        title: 'Admin desbloqueado',
        description: 'O administrador foi desbloqueado com sucesso.',
      });

      await fetchSecurityData();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Falha ao desbloquear administrador.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Segurança</h1>
          <p className="text-muted-foreground">
            Monitoramento e controle de segurança do sistema
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Tentativas Falhadas (24h)
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{failedLogins.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Sessões Ativas
              </CardTitle>
              <Shield className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeSessions.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Admins Bloqueados
              </CardTitle>
              <Unlock className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lockedAdmins.length}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tentativas de Login Falhadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Tentativas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failedLogins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhuma tentativa falhada recente
                      </TableCell>
                    </TableRow>
                  ) : (
                    failedLogins.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">
                          {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                        </TableCell>
                        <TableCell>{log.admin_users?.full_name || 'N/A'}</TableCell>
                        <TableCell>{log.admin_users?.email || 'N/A'}</TableCell>
                        <TableCell className="font-mono text-xs">{log.ip_address || 'N/A'}</TableCell>
                        <TableCell>
                          <span className="text-destructive font-medium">
                            {log.details?.attempts || 1}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sessões Ativas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Admin</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Criada Em</TableHead>
                    <TableHead>Expira Em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeSessions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhuma sessão ativa
                      </TableCell>
                    </TableRow>
                  ) : (
                    activeSessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell>{session.admin_users?.full_name}</TableCell>
                        <TableCell>{session.admin_users?.email}</TableCell>
                        <TableCell className="font-mono text-xs">{session.ip_address || 'N/A'}</TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(session.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(session.expires_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRevokeSession(session.id)}
                          >
                            Revogar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {lockedAdmins.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Administradores Bloqueados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Bloqueado Até</TableHead>
                      <TableHead>Tentativas</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lockedAdmins.map((admin) => (
                      <TableRow key={admin.id}>
                        <TableCell>{admin.full_name}</TableCell>
                        <TableCell>{admin.email}</TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(admin.locked_until), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-destructive font-medium">
                          {admin.failed_login_attempts}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnlockAdmin(admin.id)}
                          >
                            <Unlock className="h-4 w-4 mr-2" />
                            Desbloquear
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

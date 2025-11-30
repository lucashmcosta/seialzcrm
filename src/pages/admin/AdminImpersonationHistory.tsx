import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ImpersonationSession {
  id: string;
  admin_user_id: string;
  target_user_name: string;
  target_user_email: string;
  organization_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  status: 'active' | 'ended';
  admin_users: {
    full_name: string;
    email: string;
  };
  organizations: {
    name: string;
  } | null;
}

export default function AdminImpersonationHistory() {
  const [sessions, setSessions] = useState<ImpersonationSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('impersonation_sessions')
        .select(`
          *,
          admin_users!inner(full_name, email),
          organizations(name)
        `)
        .order('started_at', { ascending: false });

      if (error) throw error;
      setSessions((data || []) as ImpersonationSession[]);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (loading) {
    return (
      <AdminLayout>
        <div>Carregando...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Histórico de Impersonation</h1>
          <p className="text-muted-foreground">
            Todas as sessões de impersonation realizadas por administradores
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sessões de Impersonation</CardTitle>
            <CardDescription>
              Total de {sessions.length} sessões registradas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admin</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Organização</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Nenhuma sessão encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{session.admin_users.full_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {session.admin_users.email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{session.target_user_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {session.target_user_email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {session.organizations?.name || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {formatDistanceToNow(new Date(session.started_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        {session.ended_at ? (
                          <div className="text-sm">
                            {formatDistanceToNow(new Date(session.ended_at), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>{formatDuration(session.duration_seconds)}</TableCell>
                      <TableCell>
                        <Badge variant={session.status === 'active' ? 'default' : 'secondary'}>
                          {session.status === 'active' ? 'Ativo' : 'Encerrado'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

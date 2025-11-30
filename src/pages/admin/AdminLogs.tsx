import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function AdminLogs() {
  const [authLogs, setAuthLogs] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [adminAuditLogs, setAdminAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      // Fetch CRM audit logs
      const { data: audit } = await supabase
        .from('audit_logs')
        .select(`
          *,
          users!audit_logs_changed_by_user_id_fkey (full_name),
          organizations (name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      // Fetch admin audit logs
      const { data: adminAudit } = await supabase
        .from('admin_audit_logs')
        .select(`
          *,
          admin_users (full_name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      setAuditLogs(audit || []);
      setAdminAuditLogs(adminAudit || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Logs do Sistema</h1>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            <p className="mt-4 text-muted-foreground">Carregando logs...</p>
          </div>
        ) : (
          <Tabs defaultValue="audit" className="space-y-4">
            <TabsList>
              <TabsTrigger value="audit">Logs do CRM</TabsTrigger>
              <TabsTrigger value="admin">Logs Admin</TabsTrigger>
            </TabsList>

            <TabsContent value="audit" className="space-y-4">
              <Card>
                <CardContent className="p-0">
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data/Hora</TableHead>
                          <TableHead>Organização</TableHead>
                          <TableHead>Usuário</TableHead>
                          <TableHead>Ação</TableHead>
                          <TableHead>Entidade</TableHead>
                          <TableHead>ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLogs.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                              Nenhum log encontrado
                            </TableCell>
                          </TableRow>
                        ) : (
                          auditLogs.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell className="text-sm">
                                {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                              </TableCell>
                              <TableCell>{log.organizations?.name || 'N/A'}</TableCell>
                              <TableCell>{log.users?.full_name || 'Sistema'}</TableCell>
                              <TableCell>
                                <span className={`text-xs px-2 py-1 rounded ${
                                  log.action === 'INSERT' ? 'bg-green-100 text-green-700' :
                                  log.action === 'UPDATE' ? 'bg-blue-100 text-blue-700' :
                                  log.action === 'DELETE' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {log.action}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm">{log.entity_type}</TableCell>
                              <TableCell className="font-mono text-xs">{log.entity_id?.slice(0, 8)}...</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="admin" className="space-y-4">
              <Card>
                <CardContent className="p-0">
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data/Hora</TableHead>
                          <TableHead>Admin</TableHead>
                          <TableHead>Ação</TableHead>
                          <TableHead>IP</TableHead>
                          <TableHead>Detalhes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {adminAuditLogs.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                              Nenhum log admin encontrado
                            </TableCell>
                          </TableRow>
                        ) : (
                          adminAuditLogs.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell className="text-sm">
                                {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{log.admin_users?.full_name}</p>
                                  <p className="text-xs text-muted-foreground">{log.admin_users?.email}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary">
                                  {log.action}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{log.ip_address || 'N/A'}</TableCell>
                              <TableCell className="text-xs">
                                {log.details ? JSON.stringify(log.details).slice(0, 50) + '...' : 'N/A'}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AdminLayout>
  );
}

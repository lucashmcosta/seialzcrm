import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  old_data: any;
  new_data: any;
  created_at: string;
  users?: { full_name: string } | null;
}

export function AuditLogs() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const pageSize = 20;

  useEffect(() => {
    if (organization) {
      fetchLogs();
    }
  }, [organization, filterEntity, filterAction, page]);

  const fetchLogs = async () => {
    if (!organization) return;

    setLoading(true);
    let query = supabase
      .from('audit_logs')
      .select('*, users(full_name)')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (filterEntity !== 'all') {
      query = query.eq('entity_type', filterEntity);
    }

    if (filterAction !== 'all') {
      query = query.eq('action', filterAction);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching audit logs:', error);
      setLoading(false);
      return;
    }

    setLogs(data || []);
    setLoading(false);
  };

  const getActionBadge = (action: string) => {
    const colors = {
      INSERT: 'bg-green-500',
      UPDATE: 'bg-blue-500',
      DELETE: 'bg-red-500',
    };
    return colors[action as keyof typeof colors] || 'bg-muted';
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(dateString));
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t('auditLogs.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('auditLogs.description')}</p>
        </div>

        <div className="flex gap-4">
          <Select value={filterEntity} onValueChange={setFilterEntity}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t('auditLogs.entityType')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              <SelectItem value="contacts">{t('navigation.contacts')}</SelectItem>
              <SelectItem value="opportunities">{t('navigation.opportunities')}</SelectItem>
              <SelectItem value="tasks">{t('navigation.tasks')}</SelectItem>
              <SelectItem value="companies">{t('navigation.companies')}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t('auditLogs.action')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              <SelectItem value="INSERT">{t('auditLogs.actions.INSERT')}</SelectItem>
              <SelectItem value="UPDATE">{t('auditLogs.actions.UPDATE')}</SelectItem>
              <SelectItem value="DELETE">{t('auditLogs.actions.DELETE')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">{t('auditLogs.noLogs')}</div>
        ) : (
          <>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('auditLogs.date')}</TableHead>
                    <TableHead>{t('auditLogs.user')}</TableHead>
                    <TableHead>{t('auditLogs.entityType')}</TableHead>
                    <TableHead>{t('auditLogs.action')}</TableHead>
                    <TableHead>{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {formatDate(log.created_at)}
                      </TableCell>
                      <TableCell>{log.users?.full_name || '-'}</TableCell>
                      <TableCell className="capitalize">{log.entity_type}</TableCell>
                      <TableCell>
                        <Badge className={getActionBadge(log.action)}>
                          {t(`auditLogs.actions.${log.action}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          {t('common.view')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                {t('common.previous')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('common.page')} {page + 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={logs.length < pageSize}
              >
                {t('common.next')}
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </>
        )}
      </div>

      <Sheet open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t('auditLogs.details')}</SheetTitle>
          </SheetHeader>
          {selectedLog && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('auditLogs.entityType')}</p>
                  <p className="text-sm capitalize">{selectedLog.entity_type}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('auditLogs.action')}</p>
                  <Badge className={getActionBadge(selectedLog.action)}>
                    {t(`auditLogs.actions.${selectedLog.action}`)}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('auditLogs.date')}</p>
                  <p className="text-sm">{formatDate(selectedLog.created_at)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('auditLogs.user')}</p>
                  <p className="text-sm">{selectedLog.users?.full_name || '-'}</p>
                </div>
              </div>

              {selectedLog.old_data && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">{t('auditLogs.oldValue')}</p>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.old_data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.new_data && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">{t('auditLogs.newValue')}</p>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.new_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}
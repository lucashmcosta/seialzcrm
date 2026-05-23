import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

type HealthSummary = {
  pending: number;
  running: number;
  running_stuck_5m: number;
  failed: number;
  dead_letter: number;
  success_24h: number;
  failed_24h: number;
  subscriptions_active: number;
  subscriptions_paused: number;
  worker_last_run_at: string | null;
  reaper_last_run_at: string | null;
  generated_at: string;
};

function fmt(ts: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  const diff = Math.round((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.round(diff / 60)}min atrás`;
  return d.toLocaleString('pt-BR');
}

function Metric({ label, value, tone = 'default' }: { label: string; value: number | string; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  const toneClass =
    tone === 'good' ? 'text-green-600' :
    tone === 'warn' ? 'text-yellow-600' :
    tone === 'bad' ? 'text-red-600' : 'text-foreground';
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={`text-3xl font-bold mt-1 ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

export default function AdminIntegrationHealth() {
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [failures, setFailures] = useState<any[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const [{ data: h }, { data: f }, { data: e }, { data: s }] = await Promise.all([
      supabase.rpc('fn_outbox_health_summary'),
      supabase.from('integration_jobs')
        .select('id,integration_slug,status,attempts,last_error,last_error_at,next_run_at,organization_id')
        .in('status', ['failed', 'dead_letter'])
        .order('last_error_at', { ascending: false, nullsFirst: false })
        .limit(20),
      supabase.from('integration_audit_logs')
        .select('id,created_at,integration_slug,action,actor,job_id,details')
        .eq('actor', 'integration-worker')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('integration_subscriptions')
        .select('id,integration_slug,target_action,is_active,paused_until,config,organization_id')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    setHealth(h as any);
    setFailures(f ?? []);
    setExecutions(e ?? []);
    setSubs(s ?? []);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, []);

  const status = useMemo(() => {
    if (!health) return { color: 'bg-muted', label: 'Carregando…' };
    if (health.running_stuck_5m > 0) return { color: 'bg-red-600', label: `${health.running_stuck_5m} job(s) travados há mais de 5min` };
    if (health.failed > 50 || health.dead_letter > 100) return { color: 'bg-yellow-500', label: 'Acúmulo de falhas' };
    return { color: 'bg-green-600', label: 'Outbox saudável' };
  }, [health]);

  async function retry(jobId: string) {
    const { error } = await supabase.rpc('fn_outbox_retry_job', { p_job_id: jobId });
    if (error) toast.error(error.message); else { toast.success('Job reenfileirado'); refresh(); }
  }
  async function dismiss(jobId: string) {
    const reason = prompt('Motivo do dismiss:') ?? 'admin dismiss';
    const { error } = await supabase.rpc('fn_outbox_dismiss_job', { p_job_id: jobId, p_reason: reason });
    if (error) toast.error(error.message); else { toast.success('Job descartado'); refresh(); }
  }
  async function pause(id: string) {
    const until = new Date(Date.now() + 60 * 60_000).toISOString();
    const { error } = await supabase.rpc('fn_outbox_pause_subscription', { p_id: id, p_until: until });
    if (error) toast.error(error.message); else { toast.success('Subscription pausada por 1h'); refresh(); }
  }
  async function resume(id: string) {
    const { error } = await supabase.rpc('fn_outbox_resume_subscription', { p_id: id });
    if (error) toast.error(error.message); else { toast.success('Subscription retomada'); refresh(); }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Integration Health</h1>

        <div className={`rounded-lg p-4 text-white ${status.color}`}>
          <div className="flex items-center justify-between">
            <div className="font-semibold">{status.label}</div>
            <Button size="sm" variant="secondary" onClick={refresh} disabled={loading}>Atualizar</Button>
          </div>
          {health && (
            <div className="text-xs opacity-90 mt-1">
              Worker: {fmt(health.worker_last_run_at)} · Reaper: {fmt(health.reaper_last_run_at)} · Gerado: {fmt(health.generated_at)}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Metric label="Pendentes" value={health?.pending ?? '—'} />
          <Metric label="Running" value={health?.running ?? '—'} />
          <Metric label="Travados >5min" value={health?.running_stuck_5m ?? '—'} tone={(health?.running_stuck_5m ?? 0) > 0 ? 'bad' : 'good'} />
          <Metric label="Failed" value={health?.failed ?? '—'} tone={(health?.failed ?? 0) > 50 ? 'warn' : 'default'} />
          <Metric label="Dead-letter" value={health?.dead_letter ?? '—'} />
          <Metric label="Sucesso 24h" value={health?.success_24h ?? '—'} tone="good" />
        </div>

        <Tabs defaultValue="failures">
          <TabsList>
            <TabsTrigger value="failures">Últimas falhas ({failures.length})</TabsTrigger>
            <TabsTrigger value="executions">Últimas execuções ({executions.length})</TabsTrigger>
            <TabsTrigger value="subscriptions">Subscriptions ({subs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="failures">
            <Card>
              <CardHeader><CardTitle>Falhas recentes</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Integração</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tentativas</TableHead>
                      <TableHead>Último erro</TableHead>
                      <TableHead>Quando</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {failures.map((j) => (
                      <TableRow key={j.id}>
                        <TableCell className="font-mono text-xs">{j.integration_slug}</TableCell>
                        <TableCell><Badge variant={j.status === 'dead_letter' ? 'destructive' : 'secondary'}>{j.status}</Badge></TableCell>
                        <TableCell>{j.attempts}</TableCell>
                        <TableCell className="max-w-md truncate text-xs text-muted-foreground" title={j.last_error}>{j.last_error}</TableCell>
                        <TableCell className="text-xs">{fmt(j.last_error_at)}</TableCell>
                        <TableCell className="space-x-2">
                          <Button size="sm" variant="outline" onClick={() => retry(j.id)}>Retry</Button>
                          <Button size="sm" variant="ghost" onClick={() => dismiss(j.id)}>Dismiss</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="executions">
            <Card>
              <CardHeader><CardTitle>Execuções do worker</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Integração</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Job</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {executions.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">{fmt(l.created_at)}</TableCell>
                        <TableCell className="font-mono text-xs">{l.integration_slug}</TableCell>
                        <TableCell><Badge variant="outline">{l.action}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{l.job_id?.slice(0, 8)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subscriptions">
            <Card>
              <CardHeader><CardTitle>Subscriptions</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Integração</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Pausada até</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subs.map((s) => {
                      const paused = !s.is_active || (s.paused_until && new Date(s.paused_until) > new Date());
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs">{s.integration_slug}</TableCell>
                          <TableCell className="text-xs">{s.target_action}</TableCell>
                          <TableCell>
                            <Badge variant={paused ? 'secondary' : 'default'}>{paused ? 'Pausada/Inativa' : 'Ativa'}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{s.paused_until ? fmt(s.paused_until) : '—'}</TableCell>
                          <TableCell className="space-x-2">
                            {paused
                              ? <Button size="sm" variant="outline" onClick={() => resume(s.id)}>Retomar</Button>
                              : <Button size="sm" variant="ghost" onClick={() => pause(s.id)}>Pausar 1h</Button>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

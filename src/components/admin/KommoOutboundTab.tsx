import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowClockwise, Eye } from '@phosphor-icons/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  integrationId: string;
  integrationSlug: string;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  success: 'default',
  pending: 'secondary',
  in_progress: 'secondary',
  dead_letter: 'destructive',
  failed: 'destructive',
};

export function KommoOutboundTab({ integrationId, integrationSlug }: Props) {
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [savingToggle, setSavingToggle] = useState(false);
  const [previewJob, setPreviewJob] = useState<any | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Orgs com essa integracao habilitada
  const { data: orgs } = useQuery({
    queryKey: ['admin-integration-orgs', integrationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('id, organization_id, config_values, is_enabled, organizations:organization_id(id, name)')
        .eq('integration_id', integrationId);
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (!selectedOrgId && orgs && orgs.length > 0) {
      setSelectedOrgId(orgs[0].organization_id);
    }
  }, [orgs, selectedOrgId]);

  const currentOrg = useMemo(
    () => orgs?.find((o: any) => o.organization_id === selectedOrgId),
    [orgs, selectedOrgId],
  );
  const outboundEnabled =
    (currentOrg?.config_values as any)?.outbound_enabled !== false; // default true

  const { data: jobs, refetch: refetchJobs } = useQuery({
    queryKey: ['admin-integration-jobs', integrationSlug, selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const { data, error } = await supabase
        .from('integration_jobs')
        .select('id, status, integration_slug, target_action, attempts, max_attempts, last_error, created_at, completed_at, payload, external_response')
        .eq('organization_id', selectedOrgId)
        .eq('integration_slug', integrationSlug)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrgId,
    refetchInterval: 10_000,
  });

  const handleToggle = async (next: boolean) => {
    if (!currentOrg) return;
    setSavingToggle(true);
    try {
      const newConfig = { ...(currentOrg.config_values as any || {}), outbound_enabled: next };
      const { error } = await supabase
        .from('organization_integrations')
        .update({ config_values: newConfig })
        .eq('id', currentOrg.id);
      if (error) throw error;
      toast.success(next ? 'Sincronizacao outbound ligada' : 'Sincronizacao outbound desligada');
      queryClient.invalidateQueries({ queryKey: ['admin-integration-orgs', integrationId] });
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSavingToggle(false);
    }
  };

  // ---------- Stage Mapping ----------
  const cfg = (currentOrg?.config_values as any) || {};
  const subdomain = cfg.subdomain as string | undefined;
  const accessToken = cfg.access_token as string | undefined;

  const { data: internalStages } = useQuery({
    queryKey: ['internal-stages', selectedOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('id, name, order_index, type')
        .eq('organization_id', selectedOrgId)
        .order('order_index');
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedOrgId,
  });

  const { data: kommoPipelines, isLoading: loadingKommo, refetch: refetchKommo } = useQuery({
    queryKey: ['kommo-pipelines', selectedOrgId, subdomain],
    queryFn: async () => {
      if (!subdomain || !accessToken) return [];
      const { data, error } = await supabase.functions.invoke('kommo-fetch-pipelines', {
        body: { subdomain, access_token: accessToken },
      });
      if (error) throw error;
      return (data?.pipelines || []) as Array<{ id: number; name: string; stages: Array<{ id: number; name: string }> }>;
    },
    enabled: !!selectedOrgId && !!subdomain && !!accessToken,
  });

  const [mappingDraft, setMappingDraft] = useState<Record<string, string>>({});
  const [savingMapping, setSavingMapping] = useState(false);

  useEffect(() => {
    const existing = (cfg.stage_mapping || {}) as Record<string, any>;
    const draft: Record<string, string> = {};
    for (const [k, v] of Object.entries(existing)) {
      if (v && typeof v === 'object' && v.pipeline_id && v.status_id) {
        draft[k] = `${v.pipeline_id}:${v.status_id}`;
      } else if (typeof v === 'string' || typeof v === 'number') {
        draft[k] = `${cfg.default_pipeline_id || ''}:${v}`;
      }
    }
    setMappingDraft(draft);
  }, [selectedOrgId, currentOrg?.id]);

  const handleSaveMapping = async () => {
    if (!currentOrg) return;
    setSavingMapping(true);
    try {
      const stage_mapping: Record<string, { pipeline_id: number; status_id: number }> = {};
      for (const [stageId, combo] of Object.entries(mappingDraft)) {
        if (!combo) continue;
        const [p, s] = combo.split(':');
        if (!p || !s) continue;
        stage_mapping[stageId] = { pipeline_id: Number(p), status_id: Number(s) };
      }
      const newConfig = { ...(currentOrg.config_values as any || {}), stage_mapping };
      const { error } = await supabase
        .from('organization_integrations')
        .update({ config_values: newConfig })
        .eq('id', currentOrg.id);
      if (error) throw error;
      toast.success('Mapeamento salvo');
      queryClient.invalidateQueries({ queryKey: ['admin-integration-orgs', integrationId] });
    } catch (e: any) {
      toast.error('Erro ao salvar mapeamento: ' + e.message);
    } finally {
      setSavingMapping(false);
    }
  };

  const handleRetry = async (jobId: string) => {
    setRetryingId(jobId);
    try {
      const { error } = await supabase.rpc('rpc_retry_integration_job', { p_job_id: jobId });
      if (error) throw error;
      toast.success('Job reenfileirado');
      refetchJobs();
    } catch (e: any) {
      toast.error('Erro ao reprocessar: ' + e.message);
    } finally {
      setRetryingId(null);
    }
  };

  if (!orgs || orgs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sincronizacao Outbound</CardTitle>
          <CardDescription>Nenhuma organizacao conectada a esta integracao.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sincronizacao Outbound</CardTitle>
          <CardDescription>
            Quando ligado, alteracoes feitas no Seialz sao replicadas pra Kommo automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Organizacao</Label>
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger className="w-96">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o: any) => (
                  <SelectItem key={o.organization_id} value={o.organization_id}>
                    {o.organizations?.name || o.organization_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border p-4">
            <div className="space-y-1">
              <Label className="text-base">Sincronizar alteracoes pra Kommo</Label>
              <p className="text-sm text-muted-foreground">
                Desligue temporariamente em casos de loop ou problema com token.
              </p>
            </div>
            <Switch
              checked={outboundEnabled}
              disabled={savingToggle || !currentOrg}
              onCheckedChange={handleToggle}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ultimos 20 jobs</CardTitle>
          <CardDescription>Atualiza automaticamente a cada 10 segundos.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Acao</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead>Erro</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!jobs || jobs.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum job ainda.
                  </TableCell>
                </TableRow>
              )}
              {jobs?.map((job: any) => (
                <TableRow key={job.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true, locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-sm">{job.target_action}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[job.status] || 'outline'}>{job.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {job.attempts}/{job.max_attempts}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {job.last_error || '-'}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => setPreviewJob(job)}>
                      <Eye size={16} />
                    </Button>
                    {(job.status === 'dead_letter' || job.status === 'failed') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={retryingId === job.id}
                        onClick={() => handleRetry(job.id)}
                      >
                        <ArrowClockwise size={16} />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!previewJob} onOpenChange={(o) => !o && setPreviewJob(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Job {previewJob?.id?.slice(0, 8)}</DialogTitle>
            <DialogDescription>{previewJob?.target_action} - {previewJob?.status}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4">
              <div>
                <Label>Payload enviado</Label>
                <pre className="text-xs bg-muted p-3 rounded mt-1 overflow-auto">
                  {JSON.stringify(previewJob?.payload ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <Label>Resposta da Kommo</Label>
                <pre className="text-xs bg-muted p-3 rounded mt-1 overflow-auto">
                  {JSON.stringify(previewJob?.external_response ?? {}, null, 2)}
                </pre>
              </div>
              {previewJob?.last_error && (
                <div>
                  <Label>Ultimo erro</Label>
                  <pre className="text-xs bg-destructive/10 text-destructive p-3 rounded mt-1 overflow-auto whitespace-pre-wrap">
                    {previewJob.last_error}
                  </pre>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowsClockwise, CheckCircle, Warning } from '@phosphor-icons/react';
import { toast } from 'sonner';

interface Props {
  orgId?: string;
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

export function SyncStatusCard({ orgId }: Props) {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const { data: status } = useQuery({
    queryKey: ['marketing-sync-status', orgId],
    enabled: !!orgId,
    refetchInterval: 60000,
    queryFn: async () => {
      if (!orgId) return null;
      const [{ data: lastSync }, { count: activeCount }] = await Promise.all([
        supabase
          .from('marketing_campaign_insights_daily')
          .select('synced_at')
          .eq('organization_id', orgId)
          .order('synced_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('marketing_campaigns')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('platform', 'meta')
          .eq('status', 'active')
          .is('deleted_at', null),
      ]);
      return {
        lastSyncAt: lastSync?.synced_at as string | null,
        activeAds: activeCount ?? 0,
      };
    },
  });

  const lastSyncIso = status?.lastSyncAt;
  const ageHours = lastSyncIso ? (Date.now() - new Date(lastSyncIso).getTime()) / 3600000 : Infinity;
  const isStale = ageHours > 26;

  async function handleSync() {
    if (!orgId || syncing) return;
    setSyncing(true);
    try {
      const { error: discErr } = await supabase.functions.invoke('meta-discover-ads-cron', {
        body: { organization_id: orgId },
      });
      if (discErr) throw discErr;
      const { error: insErr } = await supabase.functions.invoke('marketing-insights-sync-daily', {
        body: { organization_id: orgId, days_back: 3, limit: 200 },
      });
      if (insErr) throw insErr;
      toast.success('Sincronização concluída');
      await qc.invalidateQueries({ queryKey: ['marketing-sync-status', orgId] });
      await qc.invalidateQueries({ queryKey: ['marketing-overview'] });
      await qc.invalidateQueries({ queryKey: ['marketing-timeseries'] });
      await qc.invalidateQueries({ queryKey: ['marketing-ads'] });
    } catch (err: any) {
      toast.error('Falha ao sincronizar', { description: err?.message ?? 'Tente novamente' });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-card p-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-sm">
        {isStale ? (
          <Warning size={16} weight="fill" className="text-destructive" />
        ) : (
          <CheckCircle size={16} weight="fill" className="text-success" />
        )}
        <span className="text-muted-foreground">
          {lastSyncIso ? (
            <>
              Última sincronização <span className="text-foreground">{formatRelative(lastSyncIso)}</span>
              {' • '}
              <span className="text-foreground font-mono">{status?.activeAds ?? 0}</span> ads ativos
            </>
          ) : (
            'Nenhum dado sincronizado ainda'
          )}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleSync}
        disabled={syncing || !orgId}
        className="gap-2"
      >
        <ArrowsClockwise size={14} weight={syncing ? 'bold' : 'regular'} className={syncing ? 'animate-spin' : ''} />
        {syncing ? 'Sincronizando…' : 'Sincronizar agora'}
      </Button>
    </div>
  );
}

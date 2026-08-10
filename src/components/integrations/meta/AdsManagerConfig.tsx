/* eslint-disable @typescript-eslint/no-explicit-any -- extração verbatim do Card B legado (ConnectionForm); tipos das respostas de edge/RPC preservados como no original para não alterar comportamento. */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowsClockwise, CheckCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';

// Config de conta de anúncio (Performance) — MOVIDO do dialog legado de Lead Generation
// (Fase 0.5). Lógica preservada verbatim; agora vive na seção Performance da Meta.
// A ANÁLISE continua no módulo Marketing (/marketing).

function normalizeSyncError(reason?: string | null): string {
  switch (reason) {
    case 'not_configured': return 'Ads Manager não configurado.';
    case 'no_token': return 'Token Meta ausente ou inválido.';
    case 'decrypt_failed': return 'Não foi possível ler o token Meta salvo.';
    case 'token_invalid': return 'O token Meta expirou ou foi invalidado.';
    default: return reason || 'A sincronização não retornou dados válidos.';
  }
}
function getSyncIssue(discoverData: any, insightsData: any): string | null {
  const discoverResults = Array.isArray(discoverData?.results) ? discoverData.results : [];
  const discoverFailure =
    discoverData?.success === false ||
    (discoverData?.orgs_failed ?? 0) > 0 ||
    discoverResults.some((result: any) => result?.status === 'failed');
  if (discoverFailure) {
    const failedResult = discoverResults.find((result: any) => result?.status === 'failed');
    return normalizeSyncError(failedResult?.error || discoverData?.error);
  }
  const skippedResults = discoverResults.filter((result: any) => result?.status === 'skipped');
  if (skippedResults.length > 0 && skippedResults.length === discoverResults.length) {
    return normalizeSyncError(skippedResults[0]?.error);
  }
  const insightFailure =
    insightsData?.success === false ||
    (insightsData?.ads_failed ?? 0) > 0 ||
    (insightsData?.errors?.length ?? 0) > 0;
  if (insightFailure) return normalizeSyncError(insightsData?.errors?.[0]?.error || insightsData?.error);
  const noDiscoverWork = (discoverData?.ads_discovered ?? 0) === 0 && (discoverData?.ads_created ?? 0) === 0;
  const noInsightWork = (insightsData?.ads_processed ?? 0) === 0 && (insightsData?.days_inserted ?? 0) === 0;
  if (noDiscoverWork && noInsightWork) return 'Nenhuma campanha elegível foi sincronizada.';
  return null;
}

export function AdsManagerConfig({ enabled }: { enabled: boolean }) {
  const { organization } = useOrganization();
  const qc = useQueryClient();

  const { data: metaCred } = useQuery({
    queryKey: ['meta-cred', organization?.id],
    enabled: enabled && !!organization?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc('get_meta_credentials', { p_org_id: organization!.id });
      return (data?.[0] || null) as any;
    },
  });

  const [selectedAdAccount, setSelectedAdAccount] = useState<string>('');
  const [enableAdsSync, setEnableAdsSync] = useState<boolean>(true);

  const currentAdAccountId: string | null = metaCred?.ad_account_id || null;
  const currentSyncEnabled: boolean = metaCred?.feature_ads_manager_sync !== false;

  const adAccountsQuery = useQuery({
    queryKey: ['meta-ad-accounts', organization?.id],
    enabled: enabled && !!organization?.id,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('meta-discover-ad-accounts', {
        body: { organization_id: organization!.id },
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any).error_message || 'Falha ao listar contas');
      return (data as any)?.ad_accounts || [];
    },
  });

  const saveAdsManager = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error('Organização não encontrada');
      const accountId = selectedAdAccount || currentAdAccountId;
      if (!accountId) throw new Error('Selecione uma Ad Account');
      const account = (adAccountsQuery.data || []).find(
        (a: any) => a.id === accountId || a.account_id === accountId.replace('act_', ''),
      );
      const { data, error } = await supabase.functions.invoke('meta-ads-manager-save', {
        body: {
          organization_id: organization.id,
          ad_account_id: accountId,
          ad_account_name: account?.name || null,
          business_id: account?.business?.id || null,
          enable_sync: enableAdsSync,
        },
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any).error || 'Falha ao salvar');
      return data;
    },
    onSuccess: () => {
      toast.success('Ads Manager configurado');
      qc.invalidateQueries({ queryKey: ['meta-cred'] });
      qc.invalidateQueries({ queryKey: ['org-integration'] });
    },
    onError: (e: any) => toast.error(e.message || 'Falha ao salvar'),
  });

  const syncNow = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error('Organização não encontrada');
      const discover = await supabase.functions.invoke('meta-discover-ads-cron', {
        body: { organization_id: organization.id },
      });
      if (discover.error) throw discover.error;
      const insights = await supabase.functions.invoke('marketing-insights-sync-daily', {
        body: { organization_id: organization.id },
      });
      if (insights.error) throw insights.error;
      const syncIssue = getSyncIssue(discover.data, insights.data);
      if (syncIssue) throw new Error(syncIssue);
      return { discover: discover.data, insights: insights.data };
    },
    onSuccess: ({ discover, insights }) => {
      const details = [
        (discover?.ads_created ?? 0) > 0 ? `${discover.ads_created} campanhas novas` : null,
        (insights?.ads_processed ?? 0) > 0 ? `${insights.ads_processed} anúncios processados` : null,
        (insights?.days_inserted ?? 0) > 0 ? `${insights.days_inserted} dias de insights` : null,
      ].filter(Boolean).join(' • ');
      toast.success('Sincronização concluída', { description: details || undefined });
    },
    onError: (e: any) => toast.error(e.message || 'Falha ao sincronizar'),
  });

  const effectiveSyncEnabled =
    saveAdsManager.isSuccess || saveAdsManager.isPending ? enableAdsSync : currentSyncEnabled;

  if (!enabled) return null;

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-base font-semibold">Conta de anúncio (Ads Manager)</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Escolha a Ad Account que alimenta campanhas, criativos e insights. A análise fica em <code className="text-xs bg-muted px-1 rounded">/marketing</code>.
        </p>
      </div>

      {currentAdAccountId && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Atual: <code>{currentAdAccountId}</code>{currentSyncEnabled ? ' · sync ativo' : ' · sync desativado'}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label>Ad Account</Label>
        <Select value={selectedAdAccount || currentAdAccountId || ''} onValueChange={setSelectedAdAccount} disabled={adAccountsQuery.isLoading}>
          <SelectTrigger>
            <SelectValue placeholder={adAccountsQuery.isLoading ? 'Carregando contas...' : 'Selecione uma Ad Account'} />
          </SelectTrigger>
          <SelectContent>
            {(adAccountsQuery.data || []).map((acc: any) => (
              <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.id})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {adAccountsQuery.isError && (
          <p className="text-xs text-destructive">{(adAccountsQuery.error as any)?.message || 'Falha ao listar contas'}</p>
        )}
        {!adAccountsQuery.isLoading && !adAccountsQuery.isError && (adAccountsQuery.data || []).length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma Ad Account acessível por esse token. Verifique permissões <code>ads_read</code> e <code>business_management</code>.</p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">Sincronizar campanhas e insights</p>
          <p className="text-xs text-muted-foreground">Liga o sync automático diário que popula <code>/marketing</code>.</p>
        </div>
        <Switch checked={effectiveSyncEnabled} onCheckedChange={setEnableAdsSync} />
      </div>

      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={() => syncNow.mutate()} disabled={syncNow.isPending || !currentAdAccountId} title="Sincronizar agora (diagnóstico)">
          <ArrowsClockwise className={`h-4 w-4 mr-1 ${syncNow.isPending ? 'animate-spin' : ''}`} />
          Sincronizar agora
        </Button>
        <Button onClick={() => saveAdsManager.mutate()} disabled={saveAdsManager.isPending || (!selectedAdAccount && !currentAdAccountId)}>
          {saveAdsManager.isPending ? 'Salvando...' : 'Salvar conta de anúncio'}
        </Button>
      </div>
    </Card>
  );
}

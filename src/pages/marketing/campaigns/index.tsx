import { uiError } from '@/lib/ui-locale';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useOrganization } from '@/hooks/useOrganization';
import { MarketingLayout } from '../_components/MarketingLayout';
import { useMarketingPublishingFlag } from '@/hooks/useMarketingPublishingFlag';
import { useCampaignsList, useSetCampaignStatus, type Campaign } from '../_hooks/useCampaigns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Play, Pause, SpinnerGap, Megaphone } from '@phosphor-icons/react';
import { toast } from 'sonner';

function statusBadge(c: Campaign) {
  const active = c.status === 'ACTIVE';
  return active
    ? <Badge variant="outline" className="gap-1 text-[10px] border-green-300 text-green-700"><Play className="h-3 w-3" weight="fill" />{uiText("Ativa")}</Badge>
    : <Badge variant="secondary" className="gap-1 text-[10px]"><Pause className="h-3 w-3" weight="fill" />{uiText("Pausada")}</Badge>;
}

export default function MarketingCampaigns() {
  useUiLocale();
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { enabled, loading: flagLoading } = useMarketingPublishingFlag(orgId);
  const list = useCampaignsList(enabled ? orgId : undefined);
  const setStatus = useSetCampaignStatus(orgId);
  const [confirming, setConfirming] = useState<Campaign | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (!orgId || flagLoading) {
    return <MarketingLayout title={uiText("Campanhas")}><Skeleton className="h-40 w-full" /></MarketingLayout>;
  }
  if (!enabled) return <Navigate to="/marketing" replace />;

  const doToggle = async (c: Campaign) => {
    const next = c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setPendingId(c.id); setConfirming(null);
    try {
      await setStatus.mutateAsync({ campaign_id: c.id, status: next });
      toast.success(next === 'PAUSED' ? uiText("Campanha pausada") : uiText("Campanha ativada"));
    } catch (e) { toast.error(uiError((e as Error)?.message || uiText("Falha"))); }
    finally { setPendingId(null); }
  };

  const campaigns = list.data ?? [];

  return (
    <MarketingLayout title={uiText("Campanhas")}>
      <Card className="p-0 overflow-hidden max-w-3xl">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Megaphone size={18} className="text-primary" />
          <div>
            <h2 className="text-sm font-semibold">{uiText("Campanhas de anúncio")}</h2>
            <p className="text-xs text-muted-foreground">{uiText("Pause ou ative campanhas da conta de anúncios direto do CRM.")}</p>
          </div>
        </div>
        {list.isLoading ? <div className="p-3 space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          : campaigns.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{uiText("Nenhuma campanha encontrada.")}</p>
          : campaigns.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 p-3 border-b border-border last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-[11px] text-muted-foreground">{c.objective ?? ''}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {statusBadge(c)}
                <Button variant="outline" size="sm" className="h-8" disabled={pendingId === c.id} onClick={() => setConfirming(c)}>
                  {pendingId === c.id ? <SpinnerGap className="h-4 w-4 animate-spin" />
                    : c.status === 'ACTIVE' ? <><Pause className="h-3.5 w-3.5 mr-1" />{uiText("Pausar")}</>
                    : <><Play className="h-3.5 w-3.5 mr-1" />{uiText("Ativar")}</>}
                </Button>
              </div>
            </div>
          ))}
      </Card>

      <AlertDialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming?.status === 'ACTIVE' ? uiText("Pausar campanha?") : uiText("Ativar campanha?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.status === 'ACTIVE'
                ? uiText("\"{0}\" vai parar de ser entregue (sem novos gastos) até ser reativada.", {"0": confirming?.name})
                : uiText("\"{0}\" volta a ser entregue e pode gerar gastos.", {"0": confirming?.name})}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{uiText("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirming && doToggle(confirming)}>{uiText("Confirmar")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MarketingLayout>
  );
}

import { Navigate } from 'react-router-dom';
import { useOrganization } from '@/hooks/useOrganization';
import { MarketingLayout } from '../_components/MarketingLayout';
import { useMarketingPublishingFlag } from '@/hooks/useMarketingPublishingFlag';
import { useWebhookStatus, useSubscribeWebhooks } from '../_hooks/useWebhooks';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, Warning, ArrowsClockwise, SpinnerGap, BellRinging } from '@phosphor-icons/react';
import { toast } from 'sonner';

const FIELD_LABEL: Record<string, string> = {
  feed: 'Posts e comentários', mention: 'Menções', messages: 'Mensagens',
  messaging_postbacks: 'Interações de botão', message_reactions: 'Reações',
};

export default function MarketingWebhooks() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { enabled, loading: flagLoading } = useMarketingPublishingFlag(orgId);
  const status = useWebhookStatus(enabled ? orgId : undefined);
  const subscribe = useSubscribeWebhooks(orgId);

  if (!orgId || flagLoading) {
    return <MarketingLayout title="Webhooks"><Skeleton className="h-40 w-full" /></MarketingLayout>;
  }
  if (!enabled) return <Navigate to="/marketing" replace />;

  const onSubscribe = async () => {
    try { await subscribe.mutateAsync(); toast.success('Assinatura de webhooks atualizada'); }
    catch (e) { toast.error((e as Error)?.message || 'Falha ao atualizar'); }
  };

  const subscribed = status.data?.subscribed;
  const fields = status.data?.fields ?? [];

  return (
    <MarketingLayout title="Webhooks">
      <Card className="p-5 space-y-4 max-w-xl">
        <div className="flex items-center gap-2">
          <BellRinging size={20} className="text-primary" />
          <h2 className="text-base font-semibold">Eventos da Página em tempo real</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          O Seialz assina os webhooks da Página conectada para receber, na hora, novas mensagens,
          comentários e menções — que aparecem na caixa de entrada e nos relatórios.
        </p>

        {status.isLoading ? <Skeleton className="h-20 w-full" /> : (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              {subscribed
                ? <Badge variant="outline" className="gap-1"><CheckCircle className="h-3.5 w-3.5 text-green-500" />Assinado</Badge>
                : <Badge variant="secondary" className="gap-1"><Warning className="h-3.5 w-3.5" />Não assinado</Badge>}
            </div>
            {fields.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {fields.map((f) => <Badge key={f} variant="secondary" className="text-[11px]">{FIELD_LABEL[f] ?? f}</Badge>)}
              </div>
            )}
          </div>
        )}

        <Button onClick={onSubscribe} disabled={subscribe.isPending}>
          {subscribe.isPending ? <SpinnerGap className="h-4 w-4 mr-1 animate-spin" /> : <ArrowsClockwise className="h-4 w-4 mr-1" />}
          {subscribed ? 'Atualizar assinatura' : 'Ativar webhooks'}
        </Button>
      </Card>
    </MarketingLayout>
  );
}

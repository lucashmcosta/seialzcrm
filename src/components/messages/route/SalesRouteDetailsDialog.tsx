// ============================================================================
// Fase 2.5 — modal de detalhes da conversa Comercial (SOMENTE LEITURA).
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { last4 } from './RouteIndicators';
import { Row, SalesRoutePanel, useSalesRouteView, type SalesRouteContextProps } from './SalesRoutePanel';

interface Props extends SalesRouteContextProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function useLastOutbound(threadId: string) {
  return useQuery({
    queryKey: ['thread-last-outbound', threadId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, created_at, endpoint_id')
        .eq('thread_id', threadId)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as { id: string; created_at: string | null; endpoint_id: string | null } | null) ?? null;
    },
  });
}

export function SalesRouteDetailsDialog({ open, onOpenChange, ...ctx }: Props) {
  const { route, history, endpointState, resolverLabel, reasonLabel, flag } = useSalesRouteView(ctx);
  const { data: lastOutbound } = useLastOutbound(ctx.threadId);

  const lastOutboundEndpoint = lastOutbound?.endpoint_id
    ? history.find((h) => h.endpointId === lastOutbound.endpoint_id) ?? null
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalhes da conversa</DialogTitle>
          <DialogDescription>
            Informações da Route Comercial. Somente leitura.
          </DialogDescription>
        </DialogHeader>

        {/* Painel de leitura completo (Route, linha, provider, endpoints, assignee) */}
        <SalesRoutePanel {...ctx} />

        <div className="space-y-0.5">
          <Row label="Contato">
            {ctx.contactName ?? '—'}
            {ctx.contactPhone ? <span className="font-data"> · {ctx.contactPhone}</span> : null}
          </Row>

          <Row label="Último outbound">
            {lastOutbound?.created_at
              ? (
                <span className="font-data">
                  {new Date(lastOutbound.created_at).toLocaleString('pt-BR')}
                  {lastOutboundEndpoint ? ` · ${last4(lastOutboundEndpoint.address)}` : ''}
                </span>
              )
              : '—'}
          </Row>
          <Row label="Feature flag ativa">
            <span className="font-data">conv_route_resolver_v2 · {flag.enabledForOrg ? 'ON' : 'OFF'}</span>
          </Row>
          <Row label="Resolver utilizado">{resolverLabel}</Row>
          <Row label="Resolução">{reasonLabel}</Row>
        </div>
      </DialogContent>
    </Dialog>
  );
}

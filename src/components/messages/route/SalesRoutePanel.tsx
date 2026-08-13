// ============================================================================
// Fase 2.5 — painel "Informações da conversa" (SOMENTE LEITURA).
// Todos os dados vêm de APIs/tabelas existentes.
// ============================================================================

import { useSalesRoute } from '@/hooks/messages/useSalesRoute';
import { useThreadEndpointHistory } from '@/hooks/messages/useThreadEndpointHistory';
import { useRouteResolverFlag } from '@/hooks/messages/useRouteResolverFlag';
import { EndpointHistoryTrail, EndpointStatusChip, ProviderChip, last4, providerLabel } from './RouteIndicators';

export interface SalesRouteContextProps {
  threadId: string;
  organizationId?: string | null;
  businessContext?: string | null;
  channel?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  assigneeName?: string | null;
  statusLabel?: string | null;
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/60 last:border-0">
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      <div className="text-[11px] text-foreground text-right min-w-0 break-words">{children}</div>
    </div>
  );
}

export function useSalesRouteView(props: SalesRouteContextProps) {
  const { route, isLoading } = useSalesRoute({
    threadId: props.threadId,
    organizationId: props.organizationId,
    businessContext: props.businessContext,
    channel: props.channel,
  });
  const { history } = useThreadEndpointHistory(props.threadId);
  const { flag } = useRouteResolverFlag(props.organizationId);

  const endpointState: 'online' | 'offline' | 'no_route' = route.resolved
    ? route.activeEndpoint?.is_active === true
      ? 'online'
      : 'offline'
    : 'no_route';

  const resolverLabel = flag.enabledForOrg ? 'Route Resolver V2' : 'Modo legado';

  const reasonLabel = route.resolved
    ? 'Resolvida pela última inbound roteável'
    : route.reason === 'flag_off'
      ? 'Modo legado (resolver V2 desligado)'
      : route.reason === 'REPLY_ROUTE_UNRESOLVED'
        ? 'REPLY_ROUTE_UNRESOLVED (sem inbound roteável)'
        : route.reason === 'not_sales_context'
          ? 'Fora do escopo Comercial/WhatsApp'
          : '—';

  return { route, isLoading, history, flag, endpointState, resolverLabel, reasonLabel };
}

export function SalesRoutePanel(props: SalesRouteContextProps) {
  const { route, history, endpointState, resolverLabel, reasonLabel } = useSalesRouteView(props);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 flex-wrap pb-2">
        <EndpointStatusChip state={endpointState} />
        <ProviderChip provider={route.activeEndpoint?.provider ?? null} />
        <span className="text-[10px] text-muted-foreground">{resolverLabel}</span>
      </div>

      <Row label="Thread ID"><span className="font-data">{props.threadId}</span></Row>
      <Row label="Route">{route.line?.name ?? route.line?.route_slug ?? 'Sem Route'}</Row>
      <Row label="Linha"><span className="font-data">{route.line?.key ?? route.line?.id ?? '—'}</span></Row>
      <Row label="Provider">{providerLabel(route.activeEndpoint?.provider)}</Row>
      <Row label="Endpoint ativo">
        <span className="font-data">{route.activeEndpoint?.external_address ?? '—'}</span>
      </Row>
      <Row label="Endpoints históricos">
        {history.length > 0 ? <EndpointHistoryTrail items={history} className="justify-end" /> : '—'}
      </Row>
      <Row label="Última inbound roteável">
        <span className="font-data">
          {route.discoveredByEndpoint?.external_address
            ? `${last4(route.discoveredByEndpoint.external_address)} · ${providerLabel(route.discoveredByEndpoint.provider)}`
            : '—'}
        </span>
      </Row>
      <Row label="Assignee">{props.assigneeName ?? 'Sem responsável'}</Row>
      <Row label="Status">{props.statusLabel ?? '—'}</Row>
      <Row label="Canal">{props.channel ?? 'whatsapp'}</Row>
      <Row label="Business Context">{props.businessContext ?? 'sales'}</Row>
      <Row label="Resolução">{reasonLabel}</Row>
    </div>
  );
}

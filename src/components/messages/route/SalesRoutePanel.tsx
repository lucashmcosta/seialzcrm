// ============================================================================
// Fase 2.5 / 2.5.1 — painel "Detalhes da rota" (SOMENTE LEITURA), estilo CRM Card.
// Todos os dados vêm de APIs/tabelas existentes. Nenhuma query nova.
// Este é o único lugar (com o modal) onde termos técnicos podem aparecer.
// ============================================================================

import React from 'react';
import { useSalesRoute } from '@/hooks/messages/useSalesRoute';

import { useThreadEndpointHistory } from '@/hooks/messages/useThreadEndpointHistory';
import { useRouteResolverFlag } from '@/hooks/messages/useRouteResolverFlag';
import { EndpointStatusChip, ProviderChip, last4, providerLabel, type EndpointState } from './RouteIndicators';

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

export const Row = React.forwardRef<
  HTMLDivElement,
  { label: string; children: React.ReactNode }
>(function Row({ label, children }, ref) {
  return (
    <div ref={ref} className="flex items-start justify-between gap-3 py-1.5 border-b border-border/60 last:border-0">
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      <div className="text-[11px] text-foreground text-right min-w-0 break-words">{children}</div>
    </div>
  );
});


export function useSalesRouteView(props: SalesRouteContextProps) {
  const { route, isLoading } = useSalesRoute({
    threadId: props.threadId,
    organizationId: props.organizationId,
    businessContext: props.businessContext,
    channel: props.channel,
  });
  const { history } = useThreadEndpointHistory(props.threadId);
  const { flag } = useRouteResolverFlag(props.organizationId);

  // Fonte de verdade única: o resolver. `unresolved` SOMENTE quando o resolver
  // retorna REPLY_ROUTE_UNRESOLVED. Carregando / flag off / fora de escopo =
  // `unknown` (neutro, sem aviso). Nenhum campo legado participa daqui.
  const endpointState: EndpointState = route.resolved
    ? route.activeEndpoint?.is_active === true
      ? 'online'
      : 'offline'
    : !isLoading && route.reason === 'REPLY_ROUTE_UNRESOLVED'
      ? 'unresolved'
      : 'unknown';


  /** Rótulo público (tela principal): sem jargão técnico. */
  const resolverLabelPublic = flag.enabledForOrg ? 'Rota Comercial' : 'Modo legado';
  /** Rótulo técnico: exclusivo do painel/modal. */
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

  return { route, isLoading, history, flag, endpointState, resolverLabel, resolverLabelPublic, reasonLabel };
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SalesRoutePanel(props: SalesRouteContextProps) {
  const { route, history, endpointState, resolverLabel, resolverLabelPublic, reasonLabel } = useSalesRouteView(props);

  const lastInbound = history.length > 0 ? history[history.length - 1] : null;

  return (
    <div className="space-y-3">
      {/* Cabeçalho do card: rota, número ativo e estado */}
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rota Comercial</p>
            <p className="text-sm font-semibold text-foreground truncate">
              {route.line?.name ?? route.line?.route_slug ?? 'Sem rota'}
            </p>
            <p className="mt-0.5 font-data text-xs text-foreground">
              {route.activeEndpoint?.external_address ?? '—'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <EndpointStatusChip state={endpointState} />
            <ProviderChip provider={route.activeEndpoint?.provider ?? null} />
          </div>
        </div>
      </div>

      {/* Histórico de endpoints utilizados */}
      <div className="rounded-md border border-border p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Histórico de endpoints utilizados
        </p>
        {history.length > 0 ? (
          <div className="mt-1.5 space-y-1">
            {history.map((h, i) => (
              <div key={h.endpointId} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-[11px]">
                  {i > 0 && <span className="text-muted-foreground">↓</span>}
                  <span className="font-data text-foreground" title={h.address ?? undefined}>
                    {last4(h.address)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{providerLabel(h.provider)}</span>
                </span>
                <span className="font-data text-[10px] text-muted-foreground">
                  {formatDateTime(h.firstSeenAt)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">—</p>
        )}
      </div>

      {/* Detalhes técnicos */}
      <div className="space-y-0.5">
        <Row label="Provider">{providerLabel(route.activeEndpoint?.provider)}</Row>
        <Row label="Endpoint ativo">
          <span className="font-data">{route.activeEndpoint?.external_address ?? '—'}</span>
        </Row>
        <Row label="Status do endpoint">
          {endpointState === 'online'
            ? 'Online'
            : endpointState === 'offline'
              ? 'Offline'
              : endpointState === 'unresolved'
                ? 'Sem rota'
                : '—'}
        </Row>
        <Row label="Roteamento">{resolverLabelPublic}</Row>
        <Row label="Resolver">{resolverLabel}</Row>
        <Row label="Última inbound roteável">
          <span className="font-data">
            {route.discoveredByEndpoint?.external_address
              ? `${last4(route.discoveredByEndpoint.external_address)} · ${providerLabel(route.discoveredByEndpoint.provider)}`
              : lastInbound
                ? `${last4(lastInbound.address)} · ${formatDateTime(lastInbound.lastSeenAt)}`
                : '—'}
          </span>
        </Row>
        <Row label="Responsável">{props.assigneeName ?? 'Sem responsável'}</Row>
        <Row label="Status">{props.statusLabel ?? '—'}</Row>
        <Row label="Thread ID"><span className="font-data">{props.threadId}</span></Row>
        <Row label="Business Context">{props.businessContext ?? 'sales'}</Row>
        <Row label="Canal">{props.channel ?? 'whatsapp'}</Row>
        <Row label="Linha"><span className="font-data">{route.line?.key ?? route.line?.id ?? '—'}</span></Row>
        <Row label="Motivo da resolução">{reasonLabel}</Row>
      </div>
    </div>
  );
}

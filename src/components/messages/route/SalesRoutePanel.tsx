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

  // Endpoint efetivo: resolver → última inbound roteável → último do histórico.
  // "Ativo" só quando veio do resolver (destino de envio validado).
  const lastHistory = history.length > 0 ? history[history.length - 1] : null;
  const effectiveEndpointSource: 'resolver' | 'inbound' | 'history' | 'none' =
    route.activeEndpoint
      ? 'resolver'
      : route.discoveredByEndpoint
        ? 'inbound'
        : lastHistory
          ? 'history'
          : 'none';

  const effectiveEndpoint =
    effectiveEndpointSource === 'resolver'
      ? { address: route.activeEndpoint?.external_address ?? null, provider: route.activeEndpoint?.provider ?? null }
      : effectiveEndpointSource === 'inbound'
        ? {
            address: route.discoveredByEndpoint?.external_address ?? null,
            provider: route.discoveredByEndpoint?.provider ?? null,
          }
        : effectiveEndpointSource === 'history'
          ? { address: lastHistory?.address ?? null, provider: lastHistory?.provider ?? null }
          : { address: null, provider: null };

  const effectiveEndpointLabel =
    effectiveEndpointSource === 'inbound'
      ? 'Endpoint efetivo'
      : effectiveEndpointSource === 'history'
        ? 'Último endpoint conhecido'
        : 'Endpoint ativo';

  return {
    route,
    isLoading,
    history,
    flag,
    endpointState,
    resolverLabel,
    resolverLabelPublic,
    reasonLabel,
    effectiveEndpoint,
    effectiveEndpointSource,
    effectiveEndpointLabel,
  };
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
  const {
    route,
    history,
    endpointState,
    resolverLabel,
    resolverLabelPublic,
    reasonLabel,
    effectiveEndpoint,
    effectiveEndpointSource,
    effectiveEndpointLabel,
  } = useSalesRouteView(props);

  const lastInbound = history.length > 0 ? history[history.length - 1] : null;

  const routeTitle =
    route.line?.name ??
    route.line?.route_slug ??
    (effectiveEndpointSource !== 'none' ? resolverLabelPublic : 'Sem rota');

  return (
    <div className="space-y-3">
      {/* Cabeçalho do card: rota, número efetivo e estado */}
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rota Comercial</p>
            <p className="text-sm font-semibold text-foreground truncate">{routeTitle}</p>
            <p className="mt-0.5 font-data text-xs text-foreground">
              {effectiveEndpoint.address ?? '—'}
            </p>
            {effectiveEndpointSource === 'inbound' || effectiveEndpointSource === 'history' ? (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {effectiveEndpointLabel} · roteamento pelo modo legado
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <EndpointStatusChip state={endpointState} />
            <ProviderChip provider={effectiveEndpoint.provider} />
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
        <Row label="Provider">{providerLabel(effectiveEndpoint.provider)}</Row>
        <Row label={effectiveEndpointLabel}>
          <span className="font-data">{effectiveEndpoint.address ?? '—'}</span>
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

// ============================================================================
// Fase 2.5 — cabeçalho da conversa Comercial (estilo Kommo).
// Exibe nome, contato, responsável, status, Route Comercial, número ativo,
// provider e "Histórico de endpoints utilizados" (informativo).
// ============================================================================

import { Link } from 'react-router-dom';
import { Avatar } from '@/components/base/avatar/avatar';
import { EndpointHistoryTrail, EndpointStatusChip, RouteBadge, providerLabel } from './RouteIndicators';
import { useSalesRouteView, type SalesRouteContextProps } from './SalesRoutePanel';

interface Props extends SalesRouteContextProps {
  contactId: string;
  statusClassName?: string;
  /** Chips existentes (janela 24h, etc.) renderizados ao lado do nome. */
  inlineChips?: React.ReactNode;
  /** Botões de ação à direita. */
  actions?: React.ReactNode;
}

export function SalesConversationHeader(props: Props) {
  const { route, history, endpointState, resolverLabel } = useSalesRouteView(props);

  return (
    <div className="border-b border-border px-6 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Avatar fallbackText={props.contactName ?? ''} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <Link
                to={`/contacts/${props.contactId}`}
                className="font-semibold text-foreground truncate hover:text-primary hover:underline transition-colors"
                title="Ver perfil do contato"
              >
                {props.contactName}
              </Link>
              <RouteBadge
                address={route.activeEndpoint?.external_address ?? null}
                provider={route.activeEndpoint?.provider ?? null}
                state={endpointState}
                size="lg"
              />
              {props.inlineChips}
              {props.statusLabel && (
                <span className={props.statusClassName ?? 'text-xs font-medium shrink-0'}>
                  {props.statusLabel}
                </span>
              )}
            </div>

            <p className="text-xs text-muted-foreground truncate">
              {props.contactPhone}
              {props.assigneeName && <span> · Atribuída a {props.assigneeName}</span>}
            </p>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[11px] text-muted-foreground">
                Respondendo por{' '}
                <span className="font-data text-foreground">
                  {route.activeEndpoint?.external_address ?? 'Sem Route'}
                </span>
                {route.activeEndpoint?.provider && (
                  <span> · {providerLabel(route.activeEndpoint.provider)}</span>
                )}
              </span>
              <EndpointStatusChip state={endpointState} />
              <span className="text-[10px] text-muted-foreground">{resolverLabel}</span>
            </div>

            {history.length > 1 && (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">Histórico de endpoints utilizados</span>
                <EndpointHistoryTrail items={history} />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">{props.actions}</div>
      </div>
    </div>
  );
}

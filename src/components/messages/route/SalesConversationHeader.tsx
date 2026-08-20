// ============================================================================
// Fase Final — cabeçalho ÚNICO da conversa Comercial (estilo Kommo), 3 linhas:
//  L1: avatar · nome (dominante) · status · [Detalhes da rota] · [Ações]
//  L2: telefone • responsável
//  L3: [Comercial] [número] [Online/Offline] [Janela]
// Provider e histórico de endpoints ficam apenas no modal técnico.
// ============================================================================

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Info } from '@phosphor-icons/react';
import { Avatar } from '@/components/base/avatar/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SalesConversationMeta } from './SalesConversationMeta';
import { useSalesRouteView, type SalesRouteContextProps } from './SalesRoutePanel';

interface Props extends SalesRouteContextProps {
  contactId: string;
  contactProfileTitle?: string;
  statusClassName?: string;
  /** Endereço/provider de fallback quando a rota ainda não resolveu. */
  fallbackAddress?: string | null;
  fallbackProvider?: string | null;
  /** Chips de janela (24h / CTWA). */
  windowChips?: ReactNode;
  /** Botões/menu de ação à direita. */
  actions?: ReactNode;
  detailsLabel?: string;
  onOpenDetails?: () => void;
}

export function SalesConversationHeader(props: Props) {
  const { route, endpointState } = useSalesRouteView(props);
  const detailsLabel = props.detailsLabel ?? 'Detalhes da rota';

  return (
    <div className="border-b border-border px-6 py-3.5">
      <div className="flex items-start gap-3">
        <Avatar fallbackText={props.contactName ?? ''} size="md" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to={`/contacts/${props.contactId}`}
              className="text-base font-semibold leading-tight text-foreground truncate hover:text-primary hover:underline transition-colors"
              title={props.contactProfileTitle ?? 'Ver perfil do contato'}
            >
              {props.contactName}
            </Link>
            {props.statusLabel && (
              <span className={cn('text-xs font-medium shrink-0', props.statusClassName ?? 'text-muted-foreground')}>
                {props.statusLabel}
              </span>
            )}

            <div className="ml-auto flex items-center gap-2 shrink-0">
              {props.onOpenDetails && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  title={detailsLabel}
                  onClick={props.onOpenDetails}
                >
                  <Info size={16} className="xl:mr-1" />
                  <span className="hidden xl:inline">{detailsLabel}</span>
                </Button>
              )}
              {props.actions}
            </div>
          </div>

          <SalesConversationMeta
            contactPhone={props.contactPhone}
            assigneeName={props.assigneeName}
            address={route.activeEndpoint?.external_address ?? props.fallbackAddress ?? null}
            provider={route.activeEndpoint?.provider ?? props.fallbackProvider ?? null}
            endpointState={endpointState}
            windowChips={props.windowChips}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Fase 2.5.1 — Linhas 2 e 3 do cabeçalho Comercial (apresentacional).
// Linha 2: telefone • responsável
// Linha 3: [Comercial] [número] [Online/Offline] [Janela]
// Provider NÃO aparece aqui — apenas no painel/modal técnico.
// ============================================================================

import { RouteBadge, NO_ROUTE_SUBTEXT } from './RouteIndicators';

interface Props {
  contactPhone?: string | null;
  assigneeName?: string | null;
  address: string | null;
  provider?: string | null;
  endpointState: 'online' | 'offline' | 'no_route';
  /** Chips de janela (24h / CTWA) renderizados ao final da linha 3. */
  windowChips?: React.ReactNode;
}

export function SalesConversationMeta({
  contactPhone,
  assigneeName,
  address,
  provider,
  endpointState,
  windowChips,
}: Props) {
  const noRoute = endpointState === 'no_route' || !address;

  return (
    <>
      <p className="text-xs text-muted-foreground truncate">
        {contactPhone}
        {assigneeName && <span> • {assigneeName}</span>}
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <RouteBadge address={address} provider={provider} state={endpointState} variant="split" />
        {windowChips}
      </div>

      {noRoute && (
        <p className="mt-1 text-[11px] text-muted-foreground">{NO_ROUTE_SUBTEXT}</p>
      )}
    </>
  );
}

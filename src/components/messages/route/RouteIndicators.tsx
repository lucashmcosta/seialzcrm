// ============================================================================
// Fase 2.5 / 2.5.1 — indicadores visuais da Route Comercial.
// Puramente apresentacional. Nenhuma lógica de negócio aqui.
// ============================================================================

import { Phone, Warning } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export function providerLabel(provider: string | null | undefined): string {
  switch (provider) {
    case 'evolution_api':
      return 'Evolution';
    case 'meta_cloud_api':
      return 'Meta';
    case 'twilio':
      return 'Twilio';
    default:
      return '—';
  }
}

export function last4(address: string | null | undefined): string {
  if (!address) return '—';
  const digits = address.replace(/\D/g, '');
  return digits.slice(-4) || address;
}

const CHIP = 'inline-flex items-center gap-1 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold';

export const NO_ROUTE_TOOLTIP = 'Esta conversa ainda não possui uma mensagem inbound roteável.';
export const NO_ROUTE_TITLE = 'Conversa legada';
export const NO_ROUTE_SUBTEXT = 'Sem inbound para determinar o número de resposta.';

export function ProviderChip({ provider, className }: { provider: string | null | undefined; className?: string }) {
  return (
    <span className={cn(CHIP, 'border-border bg-muted/60 text-muted-foreground', className)}>
      {providerLabel(provider)}
    </span>
  );
}

type EndpointState = 'online' | 'offline' | 'no_route';

export function EndpointStatusChip({ state, className }: { state: EndpointState; className?: string }) {
  const map: Record<EndpointState, { label: string; cls: string; dot: string }> = {
    online: {
      label: 'Online',
      cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
      dot: 'bg-emerald-500',
    },
    offline: {
      label: 'Offline',
      cls: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
      dot: 'bg-amber-500',
    },
    no_route: {
      label: 'Sem rota',
      cls: 'border-border bg-muted/60 text-muted-foreground',
      dot: 'bg-muted-foreground',
    },
  };
  const cfg = map[state];
  return (
    <span className={cn(CHIP, cfg.cls, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

/** Selo âmbar de conversa legada (sem inbound roteável). */
export function LegacyRouteBadge({ className }: { className?: string }) {
  return (
    <span
      title={NO_ROUTE_TOOLTIP}
      className={cn(
        CHIP,
        'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
        className,
      )}
    >
      <Warning size={11} weight="bold" />
      {NO_ROUTE_TITLE}
    </span>
  );
}

/** Ícone discreto de alerta (usado na lista lateral). */
export function LegacyRouteIcon({ className }: { className?: string }) {
  return (
    <Warning
      size={13}
      weight="bold"
      title={NO_ROUTE_TOOLTIP}
      className={cn('shrink-0 text-amber-500', className)}
    />
  );
}

/**
 * Identidade visual da conversa Comercial.
 *
 * - `variant="compact"` (lista lateral): apenas 📱 + últimos 4 dígitos.
 *   Provider aparece somente no tooltip.
 * - `variant="split"` (cabeçalho): badges separados — Comercial · número · status.
 *
 * O número NUNCA representa a identidade da conversa — apenas a rota atual.
 */
export function RouteBadge({
  address,
  provider,
  state,
  variant = 'compact',
  className,
}: {
  address: string | null | undefined;
  provider?: string | null;
  state?: EndpointState;
  variant?: 'compact' | 'split';
  className?: string;
}) {
  const noRoute = state === 'no_route' || !address;

  if (variant === 'compact') {
    if (noRoute) return <LegacyRouteIcon className={className} />;
    return (
      <span
        title={`Número de resposta ${address} · ${providerLabel(provider)}`}
        className={cn(
          CHIP,
          'border-border bg-muted/50 text-muted-foreground font-medium',
          className,
        )}
      >
        <Phone size={11} weight="fill" className="opacity-70" />
        <span className="font-data">{last4(address)}</span>
      </span>
    );
  }

  // variant="split"
  if (noRoute) return <LegacyRouteBadge className={className} />;

  return (
    <>
      <span className={cn(CHIP, 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400', className)}>
        Comercial
      </span>
      <span
        title={`Número de resposta ${address}`}
        className={cn(CHIP, 'border-border bg-muted/50 text-muted-foreground font-medium')}
      >
        <Phone size={11} weight="fill" className="opacity-70" />
        <span className="font-data">{last4(address)}</span>
      </span>
      <EndpointStatusChip state={state ?? 'online'} />
    </>
  );
}

export function EndpointHistoryTrail({
  items,
  className,
}: {
  items: Array<{ endpointId: string; address: string | null; provider: string | null }>;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground', className)}>
      {items.map((it, i) => (
        <span key={it.endpointId} className="inline-flex items-center gap-1">
          {i > 0 && <span className="opacity-50">→</span>}
          <span className="font-data" title={it.address ?? undefined}>
            {last4(it.address)}
          </span>
          <span className="opacity-70">{providerLabel(it.provider)}</span>
        </span>
      ))}
    </div>
  );
}

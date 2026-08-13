// ============================================================================
// Fase 2.5 — indicadores visuais da Route Comercial. Puramente apresentacional.
// ============================================================================

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
      label: 'Sem Route',
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

/**
 * Badge de identidade da conversa Comercial. O número NUNCA representa a
 * identidade da conversa — apenas a rota atual de envio.
 */
export function RouteBadge({
  address,
  provider,
  state,
  size = 'sm',
  className,
}: {
  address: string | null | undefined;
  provider?: string | null;
  state?: EndpointState;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const noRoute = state === 'no_route' || !address;
  return (
    <span
      title={
        noRoute
          ? 'Route Comercial não resolvida para esta conversa'
          : `Route Comercial · ${address} · ${providerLabel(provider)}`
      }
      className={cn(
        'inline-flex items-center gap-1 shrink-0 rounded-full border font-semibold',
        noRoute
          ? 'border-border bg-muted/60 text-muted-foreground'
          : 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
        size === 'lg' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0 text-[10px] leading-[16px]',
        className,
      )}
    >
      <span>Comercial</span>
      <span className="opacity-60">·</span>
      <span className="font-data">{noRoute ? 'Sem Route' : last4(address)}</span>
      {!noRoute && provider && (
        <>
          <span className="opacity-60">·</span>
          <span>{providerLabel(provider)}</span>
        </>
      )}
    </span>
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

// ============================================================================
// Fase 2.5 — Configurações > Integrações > WhatsApp Comercial.
// SOMENTE LEITURA. O status do Resolver V2 reflete a feature flag existente
// `conv_route_resolver_v2` (UPDATE só é permitido para admin de plataforma,
// portanto aqui não existe toggle).
// ============================================================================

import { Card } from '@/components/ui/card';
import { useOrganization } from '@/hooks/useOrganization';
import { useSalesRouteConfig } from '@/hooks/messages/useSalesRouteConfig';
import { useRouteResolverFlag } from '@/hooks/messages/useRouteResolverFlag';
import { EndpointStatusChip, ProviderChip, last4, providerLabel } from '@/components/messages/route/RouteIndicators';
import { ChatCircle } from '@phosphor-icons/react';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/60 last:border-0">
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      <div className="text-[11px] text-foreground text-right min-w-0 break-words">{children}</div>
    </div>
  );
}

export function SalesWhatsAppSettingsSection() {
  const { organization } = useOrganization();
  const { routes, isLoading } = useSalesRouteConfig(organization?.id);
  const { flag } = useRouteResolverFlag(organization?.id);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ChatCircle className="h-5 w-5 text-primary" weight="duotone" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">WhatsApp Comercial</h3>
            <p className="text-xs text-muted-foreground">
              Route Comercial, número ativo e endpoints vinculados. Somente leitura.
            </p>
          </div>
        </div>
        {/* Status informativo do resolver — sem toggle (flag é gerenciada pelo admin) */}
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Modo de roteamento</div>
          <div className="text-xs font-semibold text-foreground">
            {flag.enabledForOrg ? 'Rota Comercial' : 'Modo legado'}
          </div>
          <div className="font-data text-[10px] text-muted-foreground">
            conv_route_resolver_v2 · {flag.enabledForOrg ? 'ON' : 'OFF'}
          </div>
        </div>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Carregando Route Comercial…</p>}

      {!isLoading && routes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nenhuma Route Comercial (inbox <span className="font-data">sales</span>) configurada nesta organização.
        </p>
      )}

      {routes.map((route) => {
        const state = route.activeEndpoint
          ? route.activeEndpoint.is_active === true
            ? 'online'
            : 'offline'
          : 'no_route';
        return (
          <div key={route.lineId} className="rounded-lg border border-border p-4 space-y-2">
            <Field label="Route">{route.name ?? route.routeSlug ?? route.key ?? '—'}</Field>
            <Field label="Inbox"><span className="font-data">{route.inboxKey ?? '—'}</span></Field>
            <Field label="Canal">{route.channel === 'whatsapp' ? 'WhatsApp' : (route.channel ?? '—')}</Field>
            <Field label="Número ativo">
              <span className="font-data">{route.activeEndpoint?.external_address ?? '—'}</span>
            </Field>
            <Field label="Provider">{providerLabel(route.activeEndpoint?.provider)}</Field>
            <Field label="Status">
              <EndpointStatusChip state={state as 'online' | 'offline' | 'no_route'} />
            </Field>

            <div className="pt-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Endpoints vinculados
              </div>
              {route.endpoints.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum endpoint vinculado.</p>
              ) : (
                <ul className="space-y-1">
                  {route.endpoints.map((ep) => (
                    <li key={ep.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-data" title={ep.external_address ?? undefined}>
                        {last4(ep.external_address)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <ProviderChip provider={ep.provider} />
                        {ep.isRouteActive && (
                          <span className="text-[10px] font-semibold text-primary">ativo</span>
                        )}
                        {!ep.linkActive && (
                          <span className="text-[10px] text-muted-foreground">vínculo inativo</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

// ============================================================================
// Fase 3 — Configurações > Integrações > WhatsApp Comercial (Manager).
//
// Separação obrigatória de conceitos na tela:
//   INTEGRAÇÃO   → conexão técnica com o provedor (status real, instâncias).
//   CONFIGURAÇÃO → números vinculados à Route Comercial.
//   REGRA        → número ativo de envio e modo de roteamento (feature flag).
//
// Tela provider-agnostic (Meta / Twilio / Evolution). Nenhuma credencial é
// exibida ou duplicada. Mutações só aparecem para admin de integrações e
// sempre passam pela edge function `sales-route-operations` (RPCs atômicas).
// ============================================================================

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useOrganization } from '@/hooks/useOrganization';
import {
  useSalesRouteManager, useCanManageIntegrations,
  type ActivationBlockedReason, type ManagerInstance, type SalesProvider,
} from '@/hooks/settings/useSalesRouteManager';
import { SalesWhatsAppConnectDialog } from '@/components/settings/SalesWhatsAppConnectDialog';
import { ProviderChip } from '@/components/messages/route/RouteIndicators';
import {
  ChatCircle, ArrowsClockwise, WarningCircle, SpinnerGap, Plus, CheckCircle, QrCode,
} from '@phosphor-icons/react';
import { toast } from 'sonner';

const PROVIDER_OPTIONS: { value: SalesProvider; label: string }[] = [
  { value: 'meta', label: 'Meta Cloud API' },
  { value: 'twilio', label: 'Twilio' },
  { value: 'evolution', label: 'Evolution' },
];

/** Estado técnico do provedor → linguagem humana. Nada de `open`/`close` na tela. */
function humanState(i: ManagerInstance): { label: string; ok: boolean } {
  if (i.technicalState === 'open') return { label: 'Conectado', ok: true };
  if (i.technicalState === 'connecting') return { label: 'Conectando…', ok: false };
  if (i.technicalState === 'close') return { label: 'QR necessário', ok: false };
  return { label: 'Desconectado', ok: false };
}

const BLOCKED_LABEL: Record<ActivationBlockedReason, string> = {
  LINK_INACTIVE: 'vínculo inativo',
  INSTANCE_NOT_LINKED: 'sem sessão vinculada',
  NOT_CONNECTED: 'sessão desconectada',
  IDENTITY_UNKNOWN: 'identidade não confirmada',
  IDENTITY_MISMATCH: 'número conectado divergente',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/60 last:border-0">
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      <div className="text-[11px] text-foreground text-right min-w-0 break-words">{children}</div>
    </div>
  );
}

function StateChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant="outline" className={ok ? 'border-primary/40 text-primary' : 'text-muted-foreground'}>
      {label}
    </Badge>
  );
}

export function SalesWhatsAppSettingsSection() {
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const { canManage } = useCanManageIntegrations(orgId);
  const {
    status, isLoading, error, refetch,
    provisionEndpoint, setActiveEndpoint, refreshEvolutionIdentity, restartInstance,
  } = useSalesRouteManager(orgId);

  const [formLine, setFormLine] = useState<string | null>(null);
  const [provider, setProvider] = useState<SalesProvider>('meta');
  const [address, setAddress] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [connectTarget, setConnectTarget] = useState<
    { instanceName: string; endpointId: string | null } | null
  >(null);

  const routes = status?.routes ?? [];
  const instances = status?.evolutionInstances ?? [];
  const evolutionOn = status?.rules.evolutionIntegration === true;

  const instanceOptions = useMemo(
    () => instances.map((i) => i.instanceName),
    [instances],
  );

  const submitProvision = async (lineId: string) => {
    try {
      await provisionEndpoint.mutateAsync({
        lineId,
        provider,
        address: address.trim(),
        displayName: displayName.trim() || null,
        instanceName: provider === 'evolution' ? instanceName.trim() || null : null,
      });
      toast.success('Número vinculado à Route Comercial');
      setFormLine(null);
      setAddress(''); setDisplayName(''); setInstanceName('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao vincular número');
    }
  };

  return (
    <Card className="p-5 space-y-5">
      {/* ---------------------------------------------------------- cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ChatCircle className="h-5 w-5 text-primary" weight="duotone" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">WhatsApp Comercial</h3>
            <p className="text-xs text-muted-foreground">
              Integração técnica, números da Route Comercial e número ativo de envio.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Modo de roteamento</div>
            <div className="text-xs font-semibold text-foreground">
              {status?.rules.resolverV2 ? 'Rota Comercial' : 'Modo legado'}
            </div>
            <div className="font-data text-[10px] text-muted-foreground">
              conv_route_resolver_v2 · {status?.rules.resolverV2 ? 'ON' : 'OFF'}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Atualizar status">
            <ArrowsClockwise className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SpinnerGap className="h-4 w-4 animate-spin" /> Carregando status real…
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <WarningCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* -------------------------------------------------------- INTEGRAÇÃO */}
      {!isLoading && !error && (
        <section className="space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Integração</div>
          <div className="flex flex-wrap items-center gap-2">
            <StateChip ok label="Meta / Twilio · via integrações da organização" />
          </div>

          {evolutionOn && instances.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nenhuma sessão de WhatsApp registrada nesta organização.
            </p>
          )}

          {evolutionOn && instances.length > 0 && (
            <ul className="space-y-1">
              {instances.map((i) => {
                const st = humanState(i);
                return (
                  <li
                    key={i.instanceName}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                  >
                    <span className="font-data text-xs">{i.instanceName}</span>
                    <span className="flex flex-wrap items-center gap-2 text-[10px]">
                      <StateChip ok={st.ok} label={st.label} />
                      {i.connected && !i.identityKnown && (
                        <span className="text-muted-foreground">identidade não confirmada</span>
                      )}
                      {i.identityMatchesEndpoint === false && (
                        <span className="text-destructive">número conectado divergente</span>
                      )}
                      {i.identityMatchesEndpoint === true && (
                        <CheckCircle className="h-3.5 w-3.5 text-primary" weight="fill" />
                      )}
                      {canManage && (
                        <>
                          {!i.connected && (
                            <Button
                              size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                              onClick={() => setConnectTarget({
                                instanceName: i.instanceName,
                                endpointId: i.endpointId,
                              })}
                            >
                              <QrCode className="h-3 w-3 mr-1" /> Conectar WhatsApp
                            </Button>
                          )}
                          <Button
                            size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                            disabled={refreshEvolutionIdentity.isPending}
                            onClick={() =>
                              refreshEvolutionIdentity.mutateAsync({ instanceName: i.instanceName })
                                .then(() => toast.success('Estado real atualizado'))
                                .catch((e) => toast.error(e instanceof Error ? e.message : 'Falha'))}
                          >
                            Verificar
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                            disabled={restartInstance.isPending}
                            onClick={() =>
                              restartInstance.mutateAsync({ instanceName: i.instanceName })
                                .then(() => toast.success('Sessão reiniciada'))
                                .catch((e) => toast.error(e instanceof Error ? e.message : 'Falha'))}
                          >
                            Reiniciar
                          </Button>
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <SalesWhatsAppConnectDialog
        open={!!connectTarget}
        onOpenChange={(o) => { if (!o) setConnectTarget(null); }}
        organizationId={orgId}
        instanceName={connectTarget?.instanceName ?? null}
        endpointId={connectTarget?.endpointId ?? null}
        onConnected={() => toast.success('WhatsApp conectado e identidade confirmada')}
      />

      {/* ------------------------------------------ CONFIGURAÇÃO + REGRA */}
      {!isLoading && !error && routes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nenhuma Route Comercial (inbox <span className="font-data">sales</span>) configurada.
        </p>
      )}

      {routes.map((route) => (
        <section key={route.lineId} className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Configuração</div>
              <div className="text-sm font-semibold text-foreground">
                {route.name ?? route.routeSlug ?? 'Route Comercial'}
              </div>
            </div>
            {canManage && (
              <Button
                size="sm" variant="outline"
                onClick={() => setFormLine(formLine === route.lineId ? null : route.lineId)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Vincular número
              </Button>
            )}
          </div>

          <div>
            {route.endpoints.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum número vinculado a esta Route.</p>
            ) : (
              <ul className="space-y-1">
                {route.endpoints.map((ep) => (
                  <li key={ep.endpointId} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-data">{ep.addressMasked ?? '—'}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <ProviderChip provider={ep.providerRaw} />
                      <span className="text-[10px] text-muted-foreground">{ep.technicalStatus}</span>
                      {!ep.linkActive && (
                        <span className="text-[10px] text-muted-foreground">vínculo inativo</span>
                      )}
                      {ep.isRouteActive ? (
                        <span className="text-[10px] font-semibold text-primary">ativo para envio</span>
                      ) : canManage && ep.linkActive ? (
                        <Button
                          size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                          disabled={setActiveEndpoint.isPending}
                          onClick={() =>
                            setActiveEndpoint.mutateAsync({ lineId: route.lineId, endpointId: ep.endpointId })
                              .then(() => toast.success('Número ativo atualizado'))
                              .catch((e) => toast.error(e instanceof Error ? e.message : 'Falha'))}
                        >
                          Tornar ativo
                        </Button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {formLine === route.lineId && canManage && (
            <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
              <Row label="Provedor">
                <Select value={provider} onValueChange={(v) => setProvider(v as SalesProvider)}>
                  <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} disabled={o.value === 'evolution' && !evolutionOn}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Número (E.164)">
                <Input
                  value={address} onChange={(e) => setAddress(e.target.value)}
                  placeholder="+5511999999999" className="h-8 w-44 text-xs font-data"
                />
              </Row>
              <Row label="Rótulo (opcional)">
                <Input
                  value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Comercial 01" className="h-8 w-44 text-xs"
                />
              </Row>
              {provider === 'evolution' && (
                <Row label="Instância">
                  {instanceOptions.length > 0 ? (
                    <Select value={instanceName} onValueChange={setInstanceName}>
                      <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {instanceOptions.map((n) => (
                          <SelectItem key={n} value={n}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-muted-foreground">Nenhuma instância disponível</span>
                  )}
                </Row>
              )}
              <p className="text-[10px] text-muted-foreground">
                O número precisa pertencer comprovadamente à integração da organização. Na Evolution, o
                número real da instância é verificado no servidor antes do vínculo.
              </p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setFormLine(null)}>Cancelar</Button>
                <Button
                  size="sm"
                  disabled={
                    provisionEndpoint.isPending ||
                    address.trim().length < 8 ||
                    (provider === 'evolution' && !instanceName.trim())
                  }
                  onClick={() => submitProvision(route.lineId)}
                >
                  {provisionEndpoint.isPending && <SpinnerGap className="h-3.5 w-3.5 mr-1 animate-spin" />}
                  Vincular
                </Button>
              </div>
            </div>
          )}
        </section>
      ))}

      {!canManage && !isLoading && (
        <p className="text-[10px] text-muted-foreground">
          Somente administradores de integrações da organização podem alterar números e rotas.
        </p>
      )}
    </Card>
  );
}

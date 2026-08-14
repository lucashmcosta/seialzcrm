// ============================================================================
// Configurações > Integrações > WhatsApp Comercial (Manager).
//
// Esta tela administra QUAIS números estão disponíveis para a Route Comercial.
// Ela NÃO configura o provedor: nada de WABA, Phone Number ID, App ID, nome de
// instância ou nomes internos de Route.
//
// Apresentação padronizada: todos os números aparecem em uma lista única, com
// o mesmo layout (número | badge de provider | badge de estado operacional |
// ações), independentemente do provedor.
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
  type ActivationBlockedReason, type EndpointTechnicalStatus,
  type ManagerEndpoint, type SalesProvider,
} from '@/hooks/settings/useSalesRouteManager';
import { SalesWhatsAppConnectDialog } from '@/components/settings/SalesWhatsAppConnectDialog';
import { ProviderChip } from '@/components/messages/route/RouteIndicators';
import {
  ChatCircle, ArrowsClockwise, WarningCircle, SpinnerGap, Plus, QrCode,
} from '@phosphor-icons/react';
import { toast } from 'sonner';

const PROVIDER_OPTIONS: { value: SalesProvider; label: string }[] = [
  { value: 'meta', label: 'Meta' },
  { value: 'twilio', label: 'Twilio' },
  { value: 'evolution', label: 'Evolution' },
];

const BLOCKED_LABEL: Record<ActivationBlockedReason, string> = {
  LINK_INACTIVE: 'Vínculo inativo com a Route Comercial',
  INSTANCE_NOT_LINKED: 'Este número ainda não tem conexão de WhatsApp',
  NOT_CONNECTED: 'Conecte o WhatsApp deste número antes de ativá-lo',
  IDENTITY_UNKNOWN: 'Identidade do número ainda não confirmada',
  IDENTITY_MISMATCH: 'O WhatsApp conectado é de outro número',
};

/**
 * Estado operacional do número, em linguagem única para todos os provedores.
 * Fonte exclusiva: `technicalStatus` de `sales-route-operations/status`.
 */
const STATE_LABEL: Record<EndpointTechnicalStatus, { label: string; ok: boolean }> = {
  CONNECTED: { label: 'Conectado', ok: true },
  CONNECTING: { label: 'Conectando…', ok: false },
  QR_REQUIRED: { label: 'QR necessário', ok: false },
  DISCONNECTED: { label: 'Necessita conexão', ok: false },
  IDENTITY_UNCONFIRMED: { label: 'Identidade não confirmada', ok: false },
  IDENTITY_MISMATCH: { label: 'Número divergente', ok: false },
  NOT_LINKED: { label: 'Necessita conexão', ok: false },
  // Informativo apenas — badge neutra, nunca com aparência de ação.
  PROVIDER_MANAGED: { label: 'Gerenciado pelo provedor', ok: false },
};


function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/60 last:border-0">
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      <div className="text-[11px] text-foreground text-right min-w-0 break-words">{children}</div>
    </div>
  );
}

function StateChip({ ok, label, title }: { ok: boolean; label: string; title?: string }) {
  return (
    <Badge
      variant="outline"
      title={title}
      className={ok ? 'border-primary/40 text-primary' : 'text-muted-foreground'}
    >
      {label}
    </Badge>
  );
}

/** Item achatado: o número carrega a Route à qual pertence. */
interface NumberItem extends ManagerEndpoint {
  lineId: string;
}

export function SalesWhatsAppSettingsSection() {
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const { canManage } = useCanManageIntegrations(orgId);
  const {
    status, isLoading, error, refetch,
    provisionEndpoint, setActiveEndpoint,
  } = useSalesRouteManager(orgId);

  const [showForm, setShowForm] = useState(false);
  const [provider, setProvider] = useState<SalesProvider>('meta');
  const [address, setAddress] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [connectTarget, setConnectTarget] = useState<
    { instanceName: string; endpointId: string | null } | null
  >(null);

  const routes = status?.routes ?? [];
  const evolutionOn = status?.rules.evolutionIntegration === true;

  const instanceOptions = useMemo(
    () => (status?.evolutionInstances ?? []).map((i) => i.instanceName),
    [status?.evolutionInstances],
  );

  /** Route padrão para vincular um novo número (a primeira Route Comercial). */
  const primaryLineId = routes[0]?.lineId ?? null;

  const numbers = useMemo<NumberItem[]>(() => {
    const flat: NumberItem[] = [];
    routes.forEach((r) => r.endpoints.forEach((ep) => flat.push({ ...ep, lineId: r.lineId })));
    return flat.sort((a, b) => {
      if (a.isRouteActive !== b.isRouteActive) return a.isRouteActive ? -1 : 1;
      return (a.addressMasked ?? '').localeCompare(b.addressMasked ?? '');
    });
  }, [routes]);

  const submitProvision = async (lineId: string) => {
    try {
      await provisionEndpoint.mutateAsync({
        lineId,
        provider,
        address: address.trim(),
        displayName: displayName.trim() || null,
        instanceName: provider === 'evolution' ? instanceName.trim() || null : null,
      });
      toast.success('Número vinculado ao WhatsApp Comercial');
      setShowForm(false);
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
            <h3 className="text-sm font-semibold text-foreground">Números do WhatsApp Comercial</h3>
            <p className="text-xs text-muted-foreground">
              Números disponíveis para envio nas conversas comerciais.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canManage && primaryLineId && (
            <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Vincular número
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Atualizar status">
            <ArrowsClockwise className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SpinnerGap className="h-4 w-4 animate-spin" /> Carregando status…
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <WarningCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <SalesWhatsAppConnectDialog
        open={!!connectTarget}
        onOpenChange={(o) => { if (!o) setConnectTarget(null); }}
        organizationId={orgId}
        instanceName={connectTarget?.instanceName ?? null}
        endpointId={connectTarget?.endpointId ?? null}
        onConnected={() => toast.success('WhatsApp conectado e identidade confirmada')}
      />

      {/* --------------------------------------------- LISTA ÚNICA DE NÚMEROS */}
      {!isLoading && !error && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Modo de roteamento
            </div>
            <div className="text-xs font-medium text-foreground">
              {status?.rules.resolverV2 ? 'Automático' : 'Padrão'}
            </div>
          </div>


          {numbers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum número disponível para as conversas comerciais.
            </p>
          ) : (
            <ul className="space-y-1">
              {numbers.map((ep) => {
                const state = STATE_LABEL[ep.technicalStatus] ?? STATE_LABEL.DISCONNECTED;
                const blockedTitle = ep.activationBlockedReason
                  ? BLOCKED_LABEL[ep.activationBlockedReason]
                  : undefined;
                const needsConnection = ep.provider === 'evolution'
                  && !!ep.instanceName
                  && !ep.activationEligible
                  && (ep.technicalStatus === 'QR_REQUIRED'
                    || ep.technicalStatus === 'DISCONNECTED'
                    || ep.technicalStatus === 'IDENTITY_UNCONFIRMED');
                const canActivate = canManage && ep.linkActive && !ep.isRouteActive;

                return (
                  <li
                    key={ep.endpointId}
                    className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <span className="font-data text-sm font-semibold text-foreground shrink-0 w-[9.5rem]">
                      {ep.addressMasked ?? '—'}
                    </span>

                    <span className="flex items-center gap-2 min-w-0 flex-1">
                      <ProviderChip provider={ep.providerRaw} />
                      <StateChip ok={state.ok} label={state.label} title={blockedTitle} />
                      {ep.isRouteActive && (
                        <Badge className="text-[10px]">Ativo para envio</Badge>
                      )}
                    </span>

                    <span className="flex items-center gap-1.5 shrink-0">
                      {canActivate && needsConnection && (
                        <Button
                          size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                          onClick={() => setConnectTarget({
                            instanceName: ep.instanceName as string,
                            endpointId: ep.endpointId,
                          })}
                        >
                          <QrCode className="h-3 w-3 mr-1" /> Conectar WhatsApp
                        </Button>
                      )}
                      {canActivate && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                                disabled={setActiveEndpoint.isPending || !ep.activationEligible}
                                onClick={() =>
                                  setActiveEndpoint.mutateAsync({ lineId: ep.lineId, endpointId: ep.endpointId })
                                    .then(() => toast.success('Número ativo atualizado'))
                                    .catch((e) => toast.error(e instanceof Error ? e.message : 'Falha'))}
                              >
                                Tornar ativo
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {!ep.activationEligible && (
                            <TooltipContent side="left" className="max-w-[15rem] text-[11px]">
                              {blockedTitle ?? 'Este número ainda não pode ser ativado.'}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      )}
                    </span>

                  </li>
                );
              })}
            </ul>
          )}

          {showForm && canManage && primaryLineId && (
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
                <Row label="Sessão do WhatsApp">
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
                    <span className="text-muted-foreground">Nenhuma sessão disponível</span>
                  )}
                </Row>
              )}
              <p className="text-[10px] text-muted-foreground">
                O número precisa pertencer comprovadamente à integração da organização.
              </p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button
                  size="sm"
                  disabled={
                    provisionEndpoint.isPending ||
                    address.trim().length < 8 ||
                    (provider === 'evolution' && !instanceName.trim())
                  }
                  onClick={() => submitProvision(primaryLineId)}
                >
                  {provisionEndpoint.isPending && <SpinnerGap className="h-3.5 w-3.5 mr-1 animate-spin" />}
                  Vincular
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {!canManage && !isLoading && (
        <p className="text-[10px] text-muted-foreground">
          Somente administradores de integrações da organização podem alterar números e rotas.
        </p>
      )}
    </Card>
  );
}

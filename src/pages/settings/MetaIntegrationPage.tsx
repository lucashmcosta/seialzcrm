import { Fragment, useState, type ReactNode, type ElementType } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { usePermissions } from '@/hooks/usePermissions';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, House, PlugsConnected, Stack, SquaresFour, Megaphone, InstagramLogo,
  UserPlus, Target, WhatsappLogo, ListChecks, Code, CalendarBlank, PaperPlaneTilt,
  ChatCircleDots, ChatsCircle, ArrowSquareOut, CircleNotch,
} from '@phosphor-icons/react';
import { MetaConnectButton } from '@/components/integrations/meta/MetaConnectButton';
import { MetaAssetSelector } from '@/components/integrations/meta/MetaAssetSelector';
import { AdsManagerConfig } from '@/components/integrations/meta/AdsManagerConfig';
import { StatusDashboard } from '@/components/integrations/meta-lead-ads/StatusDashboard';
import { MetaLeadAdsDialog } from '@/components/integrations/meta-lead-ads/MetaLeadAdsDialog';
import { MetaCapiDialog } from '@/components/integrations/meta-capi/MetaCapiDialog';
import { MetaWhatsAppCloudDialog } from '@/components/integrations/meta-whatsapp-cloud/MetaWhatsAppCloudDialog';
import { fmtDateBR } from '@/pages/marketing/_lib/format';

type SectionId =
  | 'overview' | 'conexao' | 'assets' | 'capabilities'
  | 'performance' | 'organico' | 'lead-generation' | 'capi' | 'whatsapp'
  | 'logs' | 'developer';

// ---------------------------------------------------------------------------
// Página dedicada da integração Meta (Fase 0.5 — IA/UI only).
// Uma única entrada "Meta"; a conexão é a fundação e os módulos são capabilities.
// Configurar aqui; analisar Performance/Orgânico no módulo Marketing.
// ---------------------------------------------------------------------------
export default function MetaIntegrationPage() {
  const { organization } = useOrganization();
  const { permissions } = usePermissions();
  const navigate = useNavigate();
  const orgId = organization?.id;
  const isAdmin = permissions.canManageSettings;
  const [section, setSection] = useState<SectionId>('overview');

  // dialogs maduros reusados intactos
  const [leadOpen, setLeadOpen] = useState(false);
  const [capiOpen, setCapiOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);

  // conexão canônica (V1)
  const { data: conn, isLoading: connLoading } = useQuery({
    queryKey: ['meta-conn', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('meta_connections')
        .select('id,status,token_type,authorizing_meta_user_name,granted_scopes,config_id,app_id,last_health,last_token_check_at,created_at')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(1);
      return data?.[0] ?? null;
    },
  });

  const { data: assets = [] } = useQuery({
    queryKey: ['meta-assets-summary', conn?.id],
    enabled: !!conn?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('meta_assets')
        .select('asset_type,selection_state')
        .eq('connection_id', conn!.id);
      return (data ?? []) as Array<{ asset_type: string; selection_state: string }>;
    },
  });

  const { data: syncState = [] } = useQuery({
    queryKey: ['meta-sync-state', conn?.id],
    enabled: !!conn?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('meta_sync_state')
        .select('kind,last_synced_at,sync_status')
        .eq('connection_id', conn!.id);
      return (data ?? []) as Array<{ kind: string; last_synced_at: string | null; sync_status: string }>;
    },
  });

  // integrações legadas (para reusar os dialogs)
  const { data: integrations = [] } = useQuery({
    queryKey: ['available-integrations'],
    queryFn: async () => {
      const { data } = await supabase.from('admin_integrations').select('*').in('status', ['available', 'beta']);
      return data ?? [];
    },
  });
  const { data: orgIntegrations = [] } = useQuery({
    queryKey: ['organization-integrations', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('organization_integrations')
        .select('*, integration:admin_integrations(*)')
        .eq('organization_id', orgId!);
      return data ?? [];
    },
  });
  const bySlug = (slug: string) => integrations.find((i: { slug: string }) => i.slug === slug) ?? null;
  const orgBySlug = (slug: string) => {
    const integ = bySlug(slug);
    return orgIntegrations.find((oi: { integration_id: string }) => oi.integration_id === integ?.id) ?? null;
  };
  const enabledSlug = (slug: string) => Boolean(orgBySlug(slug)?.is_enabled);

  const connected = conn?.status === 'connected';
  const selCount = (t: string) => assets.filter((a) => a.asset_type === t && a.selection_state === 'selected').length;
  const lastSync = (kind: string) => syncState.find((s) => s.kind === kind)?.last_synced_at ?? null;

  const NAV: Array<{ id: SectionId; label: string; icon: ElementType; group?: string; adminOnly?: boolean }> = [
    { id: 'overview', label: 'Visão geral', icon: House },
    { id: 'conexao', label: 'Conexão', icon: PlugsConnected },
    { id: 'assets', label: 'Ativos', icon: Stack },
    { id: 'capabilities', label: 'Capabilities', icon: SquaresFour },
    { id: 'performance', label: 'Performance', icon: Megaphone, group: 'Módulos' },
    { id: 'organico', label: 'Orgânico', icon: InstagramLogo, group: 'Módulos' },
    { id: 'lead-generation', label: 'Lead Generation', icon: UserPlus, group: 'Módulos' },
    { id: 'capi', label: 'Conversions API', icon: Target, group: 'Módulos' },
    { id: 'whatsapp', label: 'WhatsApp', icon: WhatsappLogo, group: 'Módulos' },
    { id: 'logs', label: 'Logs', icon: ListChecks, group: 'Técnico', adminOnly: true },
    { id: 'developer', label: 'Developer', icon: Code, group: 'Técnico', adminOnly: true },
  ];
  const visibleNav = NAV.filter((n) => !n.adminOnly || isAdmin);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate('/settings/integrations')} aria-label="Voltar">
            <ArrowLeft />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Meta</h1>
              {connLoading ? (
                <CircleNotch className="animate-spin text-muted-foreground" />
              ) : (
                <Badge variant={connected ? 'default' : 'secondary'}>
                  {connected ? 'Conectado' : conn ? conn.status : 'Não conectado'}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Ads, Orgânico, Lead Generation, Conversions API e WhatsApp — um ecossistema.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Nav lateral */}
        <nav className="lg:w-56 shrink-0">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {visibleNav.map((n, i) => {
              const Icon = n.icon;
              const showGroup = n.group && n.group !== visibleNav[i - 1]?.group;
              return (
                <Fragment key={n.id}>
                  {showGroup && <li className="mt-3 hidden px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground lg:block">{n.group}</li>}
                  <li>
                    <button
                      type="button"
                      onClick={() => setSection(n.id)}
                      className={cn(
                        'flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        section === n.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Icon size={16} weight={section === n.id ? 'fill' : 'regular'} />
                      {n.label}
                    </button>
                  </li>
                </Fragment>
              );
            })}
          </ul>
        </nav>

        {/* Conteúdo */}
        <div className="min-w-0 flex-1 space-y-4">
          {section === 'overview' && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard label="Status" value={connected ? 'Conectado' : (conn?.status ?? 'Não conectado')} accent={connected ? 'success' : 'muted'} />
                <StatCard label="Health" value={conn?.last_health ?? '—'} sub={conn?.last_token_check_at ? `verificado ${fmtDateBR(conn.last_token_check_at)}` : undefined} />
                <StatCard label="Autorizado por" value={conn?.authorizing_meta_user_name ?? '—'} sub={conn ? `token: ${conn.token_type}` : undefined} />
                <StatCard label="Business / Ativos" value={`${selCount('business')} negócio(s)`} sub={`${selCount('ad_account')} contas · ${selCount('page')} páginas · ${selCount('instagram_account')} IG`} />
                <StatCard label="Último sync — Orgânico" value={lastSync('organic') ? fmtDateBR(lastSync('organic')!) : '—'} />
                <StatCard label="Último sync — Performance" value={lastSync('performance') ? fmtDateBR(lastSync('performance')!) : '—'} />
              </div>
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold">Módulos ativos</h3>
                <div className="flex flex-wrap gap-2">
                  <ModuleChip label="Orgânico" on={!!lastSync('organic')} />
                  <ModuleChip label="Performance" on={!!lastSync('performance')} />
                  <ModuleChip label="Lead Generation" on={enabledSlug('meta-lead-ads')} />
                  <ModuleChip label="Conversions API" on={enabledSlug('meta-capi')} />
                  <ModuleChip label="WhatsApp" on={enabledSlug('meta-whatsapp-cloud')} />
                </div>
              </Card>
            </>
          )}

          {section === 'conexao' && (
            <Card className="p-4">
              <h3 className="text-base font-semibold">Conexão (Login for Business)</h3>
              <p className="mt-1 text-sm text-muted-foreground">A conexão OAuth é a fundação de todos os módulos Meta.</p>
              <div className="mt-3"><MetaConnectButton onConnected={() => window.location.reload()} /></div>
              {conn && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
                  <Badge variant={connected ? 'default' : 'secondary'}>{connected ? 'Conectado' : conn.status}</Badge>
                  <span>token: {conn.token_type}</span>
                  {Array.isArray(conn.granted_scopes) && <span>· {conn.granted_scopes.length} permissões</span>}
                </div>
              )}
            </Card>
          )}

          {section === 'assets' && (
            <Card className="p-4">
              <h3 className="text-base font-semibold">Ativos</h3>
              <p className="mt-1 text-sm text-muted-foreground">Selecione quais Businesses, contas de anúncio, Páginas e Instagram pertencem à organização. Só os selecionados entram em sync.</p>
              <div className="mt-3">
                {conn ? <MetaAssetSelector connectionId={conn.id} /> : <EmptyHint>Conecte a Meta primeiro (aba Conexão).</EmptyHint>}
              </div>
            </Card>
          )}

          {section === 'capabilities' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CapabilityCard icon={Megaphone} title="Performance (Ads)" state={lastSync('performance') ? 'ativo' : 'disponível'} onClick={() => setSection('performance')} />
              <CapabilityCard icon={InstagramLogo} title="Orgânico" state={lastSync('organic') ? 'ativo' : 'disponível'} onClick={() => setSection('organico')} />
              <CapabilityCard icon={UserPlus} title="Lead Generation" state={enabledSlug('meta-lead-ads') ? 'ativo' : 'disponível'} onClick={() => setSection('lead-generation')} />
              <CapabilityCard icon={Target} title="Conversions API" state={enabledSlug('meta-capi') ? 'ativo' : 'disponível'} onClick={() => setSection('capi')} />
              <CapabilityCard icon={WhatsappLogo} title="WhatsApp" state={enabledSlug('meta-whatsapp-cloud') ? 'ativo' : 'disponível'} onClick={() => setSection('whatsapp')} />
              <CapabilityCard icon={CalendarBlank} title="Calendário editorial" state="em breve" />
              <CapabilityCard icon={PaperPlaneTilt} title="Publishing" state="em breve" />
              <CapabilityCard icon={ChatCircleDots} title="Comments" state="em breve" />
              <CapabilityCard icon={ChatsCircle} title="DM" state="em breve" />
            </div>
          )}

          {section === 'performance' && (
            <div className="space-y-4">
              <ConfigLinkCard
                icon={Megaphone} title="Performance (Ads)"
                desc="Configuração e status. Sincronização automática diária; a análise (gráficos, tabelas) vive no módulo Marketing."
                status={lastSync('performance') ? `Último sync: ${fmtDateBR(lastSync('performance')!)}` : 'Sync automático diário'}
                to="/marketing" toLabel="Ver no Marketing"
              />
              <AdsManagerConfig enabled={enabledSlug('meta-lead-ads')} />
            </div>
          )}
          {section === 'organico' && (
            <ConfigLinkCard
              icon={InstagramLogo} title="Orgânico"
              desc="Sincroniza mídias e insights de Páginas e Instagram. A análise vive no módulo Marketing."
              status={lastSync('organic') ? `Último sync: ${fmtDateBR(lastSync('organic')!)}` : 'Sem sync ainda'}
              to="/marketing/organic" toLabel="Ver no Marketing"
            />
          )}

          {section === 'lead-generation' && (
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Lead Generation</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Descoberta de formulários, mapeamento de campos e ingestão de leads (contatos e oportunidades).</p>
                </div>
                <Button size="sm" onClick={() => setLeadOpen(true)}>Gerenciar</Button>
              </div>
              {orgId && <div className="mt-4"><StatusDashboard organizationId={orgId} /></div>}
            </Card>
          )}
          {section === 'capi' && (
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Conversions API</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Envio server-side de eventos de conversão para a Meta.</p>
                </div>
                <Button size="sm" onClick={() => setCapiOpen(true)}>Configurar</Button>
              </div>
              <div className="mt-3"><Badge variant={enabledSlug('meta-capi') ? 'default' : 'secondary'}>{enabledSlug('meta-capi') ? 'Ativo' : 'Não configurado'}</Badge></div>
            </Card>
          )}
          {section === 'whatsapp' && (
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">WhatsApp (Cloud API)</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Conta WhatsApp Business e envio de mensagens/templates.</p>
                </div>
                <Button size="sm" onClick={() => setWaOpen(true)}>Configurar</Button>
              </div>
              <div className="mt-3"><Badge variant={enabledSlug('meta-whatsapp-cloud') ? 'default' : 'secondary'}>{enabledSlug('meta-whatsapp-cloud') ? 'Ativo' : 'Não configurado'}</Badge></div>
            </Card>
          )}

          {section === 'logs' && isAdmin && <LogsSection connectionId={conn?.id} orgId={orgId} />}
          {section === 'developer' && isAdmin && (
            <Card className="p-4">
              <h3 className="text-base font-semibold">Developer <Badge variant="outline" className="ml-1 text-[10px]">interno</Badge></h3>
              <p className="mt-1 text-sm text-muted-foreground">Metadados técnicos da conexão. Restrito a administradores.</p>
              <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <Meta k="connection_id" v={conn?.id ?? '—'} />
                <Meta k="app_id" v={conn?.app_id ?? '—'} />
                <Meta k="config_id" v={conn?.config_id ?? '—'} />
                <Meta k="token_type" v={conn?.token_type ?? '—'} />
                <Meta k="scopes" v={Array.isArray(conn?.granted_scopes) ? String(conn.granted_scopes.length) : '—'} />
                <Meta k="last_health" v={conn?.last_health ?? '—'} />
              </dl>
            </Card>
          )}
        </div>
      </div>

      {/* Dialogs maduros — reutilizados sem alteração */}
      {bySlug('meta-lead-ads') && (
        <MetaLeadAdsDialog open={leadOpen} onOpenChange={setLeadOpen} integration={bySlug('meta-lead-ads')} orgIntegration={orgBySlug('meta-lead-ads')} />
      )}
      {bySlug('meta-capi') && (
        <MetaCapiDialog open={capiOpen} onOpenChange={setCapiOpen} integration={bySlug('meta-capi')} orgIntegration={orgBySlug('meta-capi')} />
      )}
      {bySlug('meta-whatsapp-cloud') && (
        <MetaWhatsAppCloudDialog open={waOpen} onOpenChange={setWaOpen} integration={bySlug('meta-whatsapp-cloud')} orgIntegration={orgBySlug('meta-whatsapp-cloud')} />
      )}
    </div>
  );
}

// ---- helpers de apresentação (locais, sem lógica de dados) ----
function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'success' | 'muted' }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold', accent === 'success' && 'text-success', accent === 'muted' && 'text-muted-foreground')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}
function ModuleChip({ label, on }: { label: string; on: boolean }) {
  return <Badge variant={on ? 'default' : 'outline'} className={cn(!on && 'text-muted-foreground')}>{label}{on ? '' : ' · off'}</Badge>;
}
function CapabilityCard({ icon: Icon, title, state, onClick }: { icon: ElementType; title: string; state: 'ativo' | 'disponível' | 'em breve'; onClick?: () => void }) {
  const variant = state === 'ativo' ? 'default' : state === 'em breve' ? 'outline' : 'secondary';
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={cn('rounded-lg border border-border bg-card p-4 text-left transition-colors', onClick ? 'hover:border-primary/40 hover:bg-muted/40' : 'opacity-70')}>
      <div className="flex items-center gap-2"><Icon size={18} className="text-muted-foreground" /><span className="font-medium">{title}</span></div>
      <Badge variant={variant} className="mt-2 capitalize">{state}</Badge>
    </button>
  );
}
function ConfigLinkCard({ icon: Icon, title, desc, status, to, toLabel }: { icon: ElementType; title: string; desc: string; status: string; to: string; toLabel: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2"><Icon size={20} className="text-muted-foreground" /><h3 className="text-base font-semibold">{title}</h3></div>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{status}</span>
        <Button asChild variant="outline" size="sm">
          <Link to={to}>{toLabel} <ArrowSquareOut /></Link>
        </Button>
      </div>
    </Card>
  );
}
function EmptyHint({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">{children}</div>;
}
function Meta({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5"><span className="text-muted-foreground">{k}</span><span className="truncate font-mono">{v}</span></div>;
}

// Logs (read-only): sync runs recentes + falhas de ingestão. Restrito a admin.
function LogsSection({ connectionId, orgId }: { connectionId?: string; orgId?: string }) {
  const { data: runs = [] } = useQuery({
    queryKey: ['meta-logs-runs', connectionId],
    enabled: !!connectionId,
    queryFn: async () => {
      const { data } = await supabase
        .from('meta_sync_runs')
        .select('kind,mode,status,started_at,error_class')
        .eq('connection_id', connectionId!)
        .order('started_at', { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });
  const { data: failures = [] } = useQuery({
    queryKey: ['meta-logs-failures', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('contact_ingress_failures')
        .select('reason,status,attempt_count,created_at')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Execuções de sync (20 últimas)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="py-2 pr-3 font-medium">Tipo</th><th className="py-2 px-3 font-medium">Modo</th><th className="py-2 px-3 font-medium">Status</th><th className="py-2 px-3 font-medium">Início</th><th className="py-2 pl-3 font-medium">Erro</th>
            </tr></thead>
            <tbody>
              {runs.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-1.5 pr-3">{r.kind}</td>
                  <td className="py-1.5 px-3">{r.mode}</td>
                  <td className="py-1.5 px-3"><Badge variant={r.status === 'success' ? 'default' : r.status === 'error' ? 'destructive' : 'secondary'} className="text-[10px]">{r.status}</Badge></td>
                  <td className="py-1.5 px-3 text-xs text-muted-foreground whitespace-nowrap">{r.started_at ? fmtDateBR(r.started_at) : '—'}</td>
                  <td className="py-1.5 pl-3 text-xs text-muted-foreground">{r.error_class ?? '—'}</td>
                </tr>
              ))}
              {!runs.length && <tr><td colSpan={5} className="py-4 text-center text-xs text-muted-foreground">Sem execuções.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Falhas de ingestão (Lead Generation)</h3>
        {failures.length ? (
          <ul className="space-y-1 text-sm">
            {failures.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2 border-b border-border py-1.5 last:border-0">
                <span>{f.reason} <Badge variant="outline" className="ml-1 text-[10px]">{f.status}</Badge></span>
                <span className="text-xs text-muted-foreground">{f.attempt_count}× · {f.created_at ? fmtDateBR(f.created_at) : ''}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-muted-foreground">Nenhuma falha registrada.</p>}
      </Card>
    </div>
  );
}

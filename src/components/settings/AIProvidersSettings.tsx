import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Key,
  CheckCircle,
  WarningCircle,
  XCircle,
  Eye,
  EyeSlash,
  ArrowsClockwise,
  Trash,
  Sparkle,
  Lock,
} from '@phosphor-icons/react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Provider catalog
// ---------------------------------------------------------------------------
type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'elevenlabs';

interface ProviderMeta {
  id: ProviderId;
  name: string;
  description: string;
  docsUrl: string;
  capability: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o / Whisper / Embeddings',
    docsUrl: 'https://platform.openai.com/api-keys',
    capability: 'Chat · Transcrição · Embeddings',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 3.5 Sonnet / Haiku',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    capability: 'Chat',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini 2.5 Flash / Pro',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    capability: 'Chat · Embeddings',
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    description: 'Scribe v2 · STT premium',
    docsUrl: 'https://elevenlabs.io/app/settings/api-keys',
    capability: 'Transcrição',
  },
];

// Shape returned by `vw_org_provider_keys.info`
interface ProviderInfo {
  last4: string | null;
  verified_at: string | null;
  is_active: boolean;
  rotated_at: string | null;
  has_error: boolean;
  fallback_to_managed: boolean;
  monthly_budget_usd: number | null;
}

type ProviderStatus =
  | 'not_configured'
  | 'active'
  | 'invalid'
  | 'revoked';

function statusOf(info?: ProviderInfo | null): ProviderStatus {
  if (!info) return 'not_configured';
  if (info.is_active && info.verified_at) return 'active';
  if (info.has_error) return 'invalid';
  return 'revoked';
}

function StatusBadge({ status }: { status: ProviderStatus }) {
  const map: Record<ProviderStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; Icon: typeof CheckCircle }> = {
    not_configured: { label: 'Não configurado', variant: 'outline', Icon: Lock },
    active:         { label: 'Ativo',           variant: 'default', Icon: CheckCircle },
    invalid:        { label: 'Inválido',        variant: 'destructive', Icon: XCircle },
    revoked:        { label: 'Revogado',        variant: 'secondary', Icon: WarningCircle },
  };
  const { label, variant, Icon } = map[status];
  return (
    <Badge variant={variant} className="gap-1.5">
      <Icon size={12} weight="fill" />
      {label}
    </Badge>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return '—'; }
}

// ---------------------------------------------------------------------------
// Data hook
// ---------------------------------------------------------------------------
function useProviderKeys(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['ai-providers', organizationId],
    enabled: !!organizationId,
    staleTime: 1000 * 30,
    queryFn: async (): Promise<Record<string, ProviderInfo>> => {
      const { data, error } = await supabase
        .from('vw_org_provider_keys')
        .select('provider, info')
        .eq('organization_id', organizationId!);
      if (error) throw error;
      const map: Record<string, ProviderInfo> = {};
      for (const row of (data ?? []) as any[]) {
        if (row.provider && row.info) {
          map[row.provider] = row.info as ProviderInfo;
        }
      }
      return map;
    },
  });
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export function AIProvidersSettings() {
  const { organization } = useOrganization();
  const { permissions } = usePermissions();
  const canManage = permissions.canManageIntegrations;
  const { data: providerMap = {}, isLoading, refetch } = useProviderKeys(organization?.id);

  const [editing, setEditing] = useState<ProviderId | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState<ProviderId | null>(null);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Provedores de IA (BYOK)</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Use suas próprias chaves de API. O custo fica com você, com isolamento total entre organizações e
            criptografia AES-GCM. As chaves nunca aparecem em logs, no frontend ou em respostas das funções.
          </p>
        </div>
      </header>

      {!canManage && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          Você está em modo somente leitura. Apenas administradores podem cadastrar, rotacionar ou revogar chaves.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PROVIDERS.map((p) => {
          const info = providerMap[p.id];
          const status = statusOf(info);
          return (
            <ProviderCard
              key={p.id}
              meta={p}
              info={info}
              status={status}
              loading={isLoading}
              canManage={canManage}
              onConfigure={() => setEditing(p.id)}
              onRevoke={() => setConfirmingRevoke(p.id)}
            />
          );
        })}
      </div>

      {editing && organization?.id && (
        <ProviderDialog
          providerId={editing}
          organizationId={organization.id}
          currentInfo={providerMap[editing]}
          onClose={() => setEditing(null)}
          onSaved={() => { refetch(); }}
        />
      )}

      {confirmingRevoke && organization?.id && (
        <RevokeConfirm
          providerId={confirmingRevoke}
          organizationId={organization.id}
          onClose={() => setConfirmingRevoke(null)}
          onDone={() => { refetch(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
function ProviderCard({
  meta, info, status, loading, canManage, onConfigure, onRevoke,
}: {
  meta: ProviderMeta;
  info?: ProviderInfo;
  status: ProviderStatus;
  loading: boolean;
  canManage: boolean;
  onConfigure: () => void;
  onRevoke: () => void;
}) {
  const showFallbackWarning = status === 'active' && info?.fallback_to_managed;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-muted/60 flex items-center justify-center">
              <Sparkle size={18} weight="duotone" className="text-foreground/70" />
            </div>
            <div>
              <CardTitle className="text-base leading-tight">{meta.name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 flex-1">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
          {meta.capability}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-[11px] text-muted-foreground">Chave</dt>
            <dd className="font-mono text-xs">
              {info?.last4 ? <>•••• •••• {info.last4}</> : <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Verificada</dt>
            <dd className="text-xs">{formatDate(info?.verified_at ?? null)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Origem</dt>
            <dd className="text-xs">{status === 'active' ? 'Customer key (BYOK)' : '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Limite mensal</dt>
            <dd className="text-xs">
              {info?.monthly_budget_usd
                ? `US$ ${Number(info.monthly_budget_usd).toFixed(2)}`
                : <span className="text-muted-foreground">Sem limite</span>}
            </dd>
          </div>
        </dl>

        {showFallbackWarning && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
            <WarningCircle size={14} weight="fill" className="mt-0.5 shrink-0" />
            <span>Fallback managed habilitado: requests podem usar a infra do Seialz quando sua chave falhar.</span>
          </div>
        )}

        <div className="flex items-center gap-2 mt-auto pt-2">
          <Button
            size="sm"
            variant={status === 'not_configured' ? 'default' : 'outline'}
            onClick={onConfigure}
            disabled={!canManage || loading}
          >
            <Key size={14} weight="bold" className="mr-1.5" />
            {status === 'not_configured' ? 'Configurar' : 'Gerenciar'}
          </Button>
          {status !== 'not_configured' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRevoke}
              disabled={!canManage || loading}
              className="text-destructive hover:text-destructive"
            >
              <Trash size={14} weight="bold" className="mr-1.5" />
              Revogar
            </Button>
          )}
          <a
            href={meta.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Obter chave ↗
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Configure / Rotate / Policy dialog
// ---------------------------------------------------------------------------
function ProviderDialog({
  providerId, organizationId, currentInfo, onClose, onSaved,
}: {
  providerId: ProviderId;
  organizationId: string;
  currentInfo?: ProviderInfo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const meta = PROVIDERS.find((p) => p.id === providerId)!;
  const exists = !!currentInfo;

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [fallbackToManaged, setFallbackToManaged] = useState(!!currentInfo?.fallback_to_managed);
  const [fallbackOnRateLimit, setFallbackOnRateLimit] = useState(false);
  const [budget, setBudget] = useState<string>(
    currentInfo?.monthly_budget_usd != null ? String(currentInfo.monthly_budget_usd) : '',
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ['ai-providers', organizationId] });

  const saveMut = useMutation({
    mutationFn: async () => {
      const monthly = budget.trim() === '' ? null : Number(budget);
      if (monthly != null && (!Number.isFinite(monthly) || monthly < 0)) {
        throw new Error('Limite mensal inválido');
      }
      const fn = exists ? 'byok-rotate-key' : 'byok-set-key';
      const payload: Record<string, unknown> = {
        organization_id: organizationId,
        provider: providerId,
        fallback_to_managed: fallbackToManaged,
        fallback_on_rate_limit: fallbackOnRateLimit,
        monthly_budget_usd: monthly,
      };
      if (exists) payload.new_api_key = apiKey;
      else payload.api_key = apiKey;
      const { data, error } = await supabase.functions.invoke(fn, { body: payload });
      if (error) throw new Error(error.message || 'Falha ao salvar');
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success(exists ? 'Chave rotacionada com sucesso' : 'Chave salva e testada com sucesso');
      refresh(); onSaved(); onClose();
    },
    onError: (e: Error) => {
      toast.error(e.message === 'key_test_failed'
        ? 'A chave foi rejeitada pelo provider. Verifique e tente novamente.'
        : e.message);
    },
  });

  const testMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('byok-test-key', {
        body: { organization_id: organizationId, provider: providerId },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.ok) toast.success('Chave válida — provider respondeu.');
      else toast.error(`Provider rejeitou a chave (status ${data?.status ?? '?'}).`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const policyMut = useMutation({
    mutationFn: async () => {
      const monthly = budget.trim() === '' ? null : Number(budget);
      const { data, error } = await supabase.functions.invoke('byok-update-policy', {
        body: {
          organization_id: organizationId,
          provider: providerId,
          fallback_to_managed: fallbackToManaged,
          fallback_on_rate_limit: fallbackOnRateLimit,
          monthly_budget_usd: monthly,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success('Políticas atualizadas.');
      refresh(); onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = useMemo(() => apiKey.trim().length >= 8 && !saveMut.isPending, [apiKey, saveMut.isPending]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{exists ? `Gerenciar chave — ${meta.name}` : `Configurar ${meta.name}`}</DialogTitle>
          <DialogDescription>
            A chave é testada contra o provider antes de ser salva. Armazenada criptografada (AES-GCM) e nunca
            retornada ao frontend.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Current state */}
          {exists && (
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <div className="flex items-center justify-between">
                <span>Chave atual</span>
                <span className="font-mono">•••• {currentInfo?.last4 ?? '????'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Verificada em</span>
                <span>{formatDate(currentInfo?.verified_at ?? null)}</span>
              </div>
            </div>
          )}

          {/* Key input */}
          <div className="space-y-1.5">
            <Label htmlFor="api-key">
              {exists ? 'Nova chave (substitui a atual)' : 'Chave de API'}
            </Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={meta.id === 'openai' ? 'sk-…' : 'cole sua chave aqui'}
                autoComplete="off"
                spellCheck={false}
                className="font-mono pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showKey ? 'Esconder' : 'Mostrar'}
              >
                {showKey ? <EyeSlash size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              A chave é enviada apenas para a Edge Function BYOK via HTTPS. Não é armazenada em
              localStorage/sessionStorage e nunca aparece em logs.
            </p>
          </div>

          {/* Policies */}
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="text-sm">Fallback para managed</Label>
                <p className="text-[11px] text-muted-foreground">
                  Se sua chave falhar (401/inválida), usar a infra do Seialz (cobrado no plano).
                </p>
              </div>
              <Switch checked={fallbackToManaged} onCheckedChange={setFallbackToManaged} />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="text-sm">Fallback em rate-limit</Label>
                <p className="text-[11px] text-muted-foreground">
                  Quando o provider retornar 429, usar managed temporariamente.
                </p>
              </div>
              <Switch checked={fallbackOnRateLimit} onCheckedChange={setFallbackOnRateLimit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget" className="text-sm">Limite mensal (US$)</Label>
              <Input
                id="budget"
                type="number"
                min="0"
                step="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="ex.: 50.00"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Em branco = sem limite. Quando ultrapassado, novos jobs BYOK são bloqueados.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {exists && (
            <>
              <Button variant="outline" size="sm" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
                {testMut.isPending ? 'Testando…' : 'Testar conexão'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => policyMut.mutate()} disabled={policyMut.isPending}>
                {policyMut.isPending ? 'Salvando…' : 'Salvar políticas'}
              </Button>
            </>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!canSave}>
            {saveMut.isPending
              ? (exists ? 'Rotacionando…' : 'Testando e salvando…')
              : (exists ? <><ArrowsClockwise size={14} className="mr-1.5" />Rotacionar chave</> : 'Salvar & Testar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Revoke confirmation
// ---------------------------------------------------------------------------
function RevokeConfirm({
  providerId, organizationId, onClose, onDone,
}: {
  providerId: ProviderId;
  organizationId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const meta = PROVIDERS.find((p) => p.id === providerId)!;
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('byok-revoke-key', {
        body: { organization_id: organizationId, provider: providerId },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Chave do ${meta.name} revogada.`);
      onDone(); onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Revogar chave do ${meta.name}?`}
      description="A chave criptografada será apagada. Jobs subsequentes não poderão mais usar esta chave. Esta ação não pode ser desfeita — você terá que cadastrar uma nova chave para reativar o BYOK."
      confirmText={loading ? 'Revogando…' : 'Revogar'}
      variant="destructive"
      onConfirm={handle}
    />
  );
}

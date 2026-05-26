import { useState, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
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
import { Eye, EyeSlash, ArrowsClockwise, Trash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import {
  AIProviderId,
  AIProviderInfo,
  useInvalidateAIProviders,
} from '@/hooks/useAIProviders';

const PROVIDER_META: Record<AIProviderId, { name: string; docsUrl: string; placeholder: string }> = {
  openai:     { name: 'OpenAI',         docsUrl: 'https://platform.openai.com/api-keys',         placeholder: 'sk-…' },
  anthropic:  { name: 'Anthropic',      docsUrl: 'https://console.anthropic.com/settings/keys',  placeholder: 'sk-ant-…' },
  gemini:     { name: 'Google Gemini',  docsUrl: 'https://aistudio.google.com/app/apikey',       placeholder: 'AIza…' },
  elevenlabs: { name: 'ElevenLabs',     docsUrl: 'https://elevenlabs.io/app/settings/api-keys',  placeholder: 'sk_…' },
};

async function unwrapFunctionError(error: Error): Promise<Error> {
  if (!(error instanceof FunctionsHttpError)) {
    return error;
  }

  try {
    const payload = await error.context.json();
    if (payload?.error) {
      const status = payload?.status != null ? `:${String(payload.status)}` : '';
      return new Error(`${String(payload.error)}${status}`);
    }
  } catch {
    // ignore json parse issues and fall back to the original message
  }

  return new Error(error.message);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return '—'; }
}

interface AIProviderConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: AIProviderId;
  organizationId: string;
  currentInfo?: AIProviderInfo;
  /** True when a plaintext legacy `config_values.api_key` exists for this provider. */
  hasLegacyKey?: boolean;
  canManage: boolean;
}

export function AIProviderConfigDialog({
  open,
  onOpenChange,
  providerId,
  organizationId,
  currentInfo,
  hasLegacyKey,
  canManage,
}: AIProviderConfigDialogProps) {
  const meta = PROVIDER_META[providerId];
  const exists = !!currentInfo;
  const invalidate = useInvalidateAIProviders();

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [fallbackToManaged, setFallbackToManaged] = useState(!!currentInfo?.fallback_to_managed);
  const [fallbackOnRateLimit, setFallbackOnRateLimit] = useState(!!currentInfo?.fallback_on_rate_limit);
  const [budget, setBudget] = useState<string>(
    currentInfo?.monthly_budget_usd != null ? String(currentInfo.monthly_budget_usd) : '',
  );
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const refresh = () => invalidate(organizationId);

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
      if (error) throw await unwrapFunctionError(error);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success(exists ? 'Chave rotacionada com sucesso' : 'Chave salva e testada com sucesso');
      refresh();
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast.error(e.message === 'key_test_failed'
        ? 'A chave foi rejeitada pelo provider. Verifique e tente novamente.'
        : e.message === 'encryption_unavailable'
        ? 'A criptografia do servidor está indisponível agora. Tente novamente em instantes.'
        : e.message);
    },
  });

  const testMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('byok-test-key', {
        body: { organization_id: organizationId, provider: providerId },
      });
      if (error) throw await unwrapFunctionError(error);
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
      if (error) throw await unwrapFunctionError(error);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success('Políticas atualizadas.');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('byok-revoke-key', {
        body: { organization_id: organizationId, provider: providerId },
      });
      if (error) throw await unwrapFunctionError(error);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success(`Chave do ${meta.name} revogada.`);
      refresh();
      setConfirmRevoke(false);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = useMemo(
    () => canManage && apiKey.trim().length >= 8 && !saveMut.isPending,
    [canManage, apiKey, saveMut.isPending],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{exists ? `Gerenciar — ${meta.name}` : `Configurar ${meta.name}`}</DialogTitle>
            <DialogDescription>
              Modo BYOK: a chave é testada contra o provider antes de ser salva, armazenada criptografada (AES-GCM)
              e nunca retornada ao frontend.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {hasLegacyKey && !exists && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
                Esta integração usa um formato antigo de armazenamento. Para maior segurança, salve novamente a
                chave como <strong>Chave Própria criptografada</strong>. A chave antiga permanece intacta até você
                confirmar a migração.
              </div>
            )}
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
                <div className="flex items-center justify-between">
                  <span>Origem</span>
                  <span>Customer key (BYOK)</span>
                </div>
              </div>
            )}

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
                  placeholder={meta.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={!canManage}
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
                localStorage/sessionStorage e nunca aparece em logs.{' '}
                <a href={meta.docsUrl} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                  Obter chave ↗
                </a>
              </p>
            </div>

            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-3 opacity-60">
                <div>
                  <Label className="text-sm">Fallback para managed</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Em breve: usar a infra do Seialz quando sua chave falhar.
                  </p>
                </div>
                <Switch checked={fallbackToManaged} onCheckedChange={setFallbackToManaged} disabled />
              </div>
              <div className="flex items-start justify-between gap-3 opacity-60">
                <div>
                  <Label className="text-sm">Fallback em rate-limit</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Em breve: usar managed temporariamente quando o provider retornar 429.
                  </p>
                </div>
                <Switch checked={fallbackOnRateLimit} onCheckedChange={setFallbackOnRateLimit} disabled />
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
                  disabled={!canManage}
                  className="font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Em branco = sem limite. Quando ultrapassado, novos jobs BYOK são bloqueados.
                </p>
              </div>
            </div>

            {exists && canManage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmRevoke(true)}
                className="text-destructive hover:text-destructive"
              >
                <Trash size={14} weight="bold" className="mr-1.5" />
                Revogar chave permanentemente
              </Button>
            )}
          </div>

          <DialogFooter className="flex-wrap gap-2">
            {exists && (
              <>
                <Button variant="outline" size="sm" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
                  {testMut.isPending ? 'Testando…' : 'Testar conexão'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => policyMut.mutate()}
                  disabled={!canManage || policyMut.isPending}
                >
                  {policyMut.isPending ? 'Salvando…' : 'Salvar políticas'}
                </Button>
              </>
            )}
            <div className="flex-1" />
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
            {(canManage && (apiKey.length > 0 || !exists)) && (
              <Button onClick={() => saveMut.mutate()} disabled={!canSave}>
                {saveMut.isPending
                  ? (exists ? 'Rotacionando…' : 'Testando e salvando…')
                  : (exists ? <><ArrowsClockwise size={14} className="mr-1.5" />Rotacionar chave</> : 'Salvar & Testar')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title={`Revogar chave do ${meta.name}?`}
        description="A chave criptografada será apagada. Jobs subsequentes não poderão mais usar esta chave. Esta ação não pode ser desfeita — você terá que cadastrar uma nova chave para reativar o BYOK."
        confirmText={revokeMut.isPending ? 'Revogando…' : 'Revogar'}
        variant="destructive"
        onConfirm={() => revokeMut.mutate()}
      />
    </>
  );
}

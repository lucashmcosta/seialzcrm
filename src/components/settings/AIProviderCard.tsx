import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  CheckCircle, WarningCircle, XCircle, Lock, Sparkle, Key,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import {
  AIProviderInfo,
  AIProviderStatus,
  resolveProviderId,
  statusOfProvider,
  useInvalidateAIProviders,
} from '@/hooks/useAIProviders';
import { AIProviderConfigDialog } from './AIProviderConfigDialog';

const STATUS_MAP: Record<AIProviderStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; Icon: typeof CheckCircle }> = {
  not_configured:    { label: 'Não configurado',          variant: 'outline',     Icon: Lock },
  legacy_detected:   { label: 'Configuração antiga',      variant: 'outline',     Icon: WarningCircle },
  active:            { label: 'Chave própria ativa',      variant: 'default',     Icon: CheckCircle },
  inactive:          { label: 'Chave própria inativa',    variant: 'secondary',   Icon: WarningCircle },
  invalid:           { label: 'Chave inválida',           variant: 'destructive', Icon: XCircle },
  budget_exceeded:   { label: 'Limite excedido',          variant: 'destructive', Icon: WarningCircle },
  managed_fallback:  { label: 'Fallback managed',         variant: 'secondary',   Icon: WarningCircle },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return '—'; }
}

interface AIProviderCardProps {
  integration: any;
  organizationId: string;
  info?: AIProviderInfo;
  /** Legacy `organization_integrations` row — used only to detect old plaintext keys for UX. */
  legacyConnection?: any;
  canManage: boolean;
}

export function AIProviderCard({
  integration, organizationId, info, legacyConnection, canManage,
}: AIProviderCardProps) {
  const providerId = resolveProviderId(integration);
  const [dialogOpen, setDialogOpen] = useState(false);
  const invalidate = useInvalidateAIProviders();

  const hasLegacyKey = !!legacyConnection?.config_values?.api_key && !info;
  const status = statusOfProvider(info, hasLegacyKey);
  const hasNewKey = !!info;

  const toggleMut = useMutation({
    mutationFn: async (nextActive: boolean) => {
      if (!providerId) throw new Error('Provider não reconhecido');
      const { data, error } = await supabase.functions.invoke('byok-update-policy', {
        body: {
          organization_id: organizationId,
          provider: providerId,
          is_active: nextActive,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return nextActive;
    },
    onSuccess: (nextActive) => {
      toast.success(nextActive ? 'Provider ativado' : 'Provider desativado (chave preservada)');
      invalidate(organizationId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const migrateMut = useMutation({
    mutationFn: async () => {
      if (!providerId) throw new Error('Provider não reconhecido');
      const { data, error } = await supabase.functions.invoke('migrate-legacy-ai-key', {
        body: { organization_id: organizationId, provider: providerId },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success('Chave migrada com segurança. Agora está criptografada como Chave Própria.');
      invalidate(organizationId);
    },
    onError: (e: Error) => {
      const msg = e.message === 'key_test_failed'
        ? 'A chave antiga foi rejeitada pelo provider. Atualize a chave para concluir a migração.'
        : e.message === 'no_legacy_key'
        ? 'Nenhuma chave antiga encontrada para migrar.'
        : e.message === 'byok_already_configured'
        ? 'Já existe uma chave segura cadastrada. Use Gerenciar chave.'
        : e.message;
      toast.error(msg);
    },
  });

  if (!providerId) return null;

  const meta = STATUS_MAP[status];
  const StatusIcon = meta.Icon;

  const handleToggle = (checked: boolean) => {
    if (!canManage) return;
    if (!hasNewKey) {
      // No new BYOK key: if legacy exists, migrate; otherwise open config dialog.
      if (!checked) return;
      if (hasLegacyKey) migrateMut.mutate();
      else setDialogOpen(true);
      return;
    }
    toggleMut.mutate(checked);
  };

  const switchChecked = hasNewKey && info?.is_active === true;

  return (
    <>
      <Card className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {integration.logo_url ? (
              <img
                src={integration.logo_url}
                alt={integration.name}
                className="w-10 h-10 rounded-lg object-contain bg-muted p-1 shrink-0"
              />
            ) : (
              <div className="p-2 rounded-lg bg-muted shrink-0">
                <Sparkle className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium text-foreground truncate">{integration.name}</h3>
                <Badge variant={meta.variant} className="gap-1 text-[10px]">
                  <StatusIcon size={11} weight="fill" />
                  {meta.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {integration.description}
              </p>
            </div>
          </div>
          <Switch
            checked={switchChecked}
            onCheckedChange={handleToggle}
            disabled={!canManage || toggleMut.isPending}
          />
        </div>

        {status === 'legacy_detected' && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
            <WarningCircle size={14} weight="fill" className="mt-0.5 shrink-0" />
            <span>
              Detectamos uma chave configurada no formato antigo. Você pode migrá-la com segurança em 1 clique —
              a chave é testada e criptografada no servidor, sem precisar digitar novamente.
            </span>
          </div>
        )}

        {hasNewKey && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs pl-[52px]">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Chave</dt>
              <dd className="font-mono">•••• {info?.last4 ?? '????'}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Verificada</dt>
              <dd>{formatDate(info?.verified_at ?? null)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Origem</dt>
              <dd>Chave própria</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Limite</dt>
              <dd>
                {info?.monthly_budget_usd
                  ? `US$ ${Number(info.monthly_budget_usd).toFixed(2)}/mês`
                  : <span className="text-muted-foreground">Sem limite</span>}
              </dd>
            </div>
          </dl>
        )}

        <div className="flex items-center justify-end gap-2">
          {status === 'legacy_detected' ? (
            <>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-muted-foreground"
                onClick={() => setDialogOpen(true)}
                disabled={!canManage}
              >
                Usar outra chave
              </Button>
              <Button
                size="sm"
                onClick={() => migrateMut.mutate()}
                disabled={!canManage || migrateMut.isPending}
              >
                <Key size={14} weight="bold" className="mr-1.5" />
                {migrateMut.isPending ? 'Migrando…' : 'Migrar chave existente com segurança'}
              </Button>
            </>
          ) : (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-primary"
              onClick={() => setDialogOpen(true)}
              disabled={!canManage && !hasNewKey}
            >
              {hasNewKey ? 'Gerenciar chave' : 'Configurar'}
            </Button>
          )}
        </div>
      </Card>


      {dialogOpen && (
        <AIProviderConfigDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          providerId={providerId}
          organizationId={organizationId}
          currentInfo={info}
          hasLegacyKey={hasLegacyKey}
          canManage={canManage}
        />
      )}
    </>
  );
}


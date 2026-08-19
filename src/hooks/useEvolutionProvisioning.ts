// ============================================================================
// Provisionamento de instâncias Evolution (porta de entrada oficial:
// Configurações > Integrações > card "Evolution WhatsApp").
//
// Toda operação passa pela Edge Function `sales-route-operations`, que valida
// JWT + `can_manage_integrations_in_org` e nunca expõe credenciais.
// Nenhuma credencial é criada ou duplicada no cliente.
// ============================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

const FN = 'sales-route-operations';

export interface EvolutionProvisionedInstance {
  id: string;
  instanceName: string;
  endpointId: string | null;
  provisioningStatus: 'pending' | 'linked';
  state: string;
  connected: boolean;
  checkedAt: string | null;
  ownerMasked: string | null;
  identityKnown: boolean;
  createdAt: string;
}

async function callOp<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(FN, { body });
  if (error) {
    // Erros de negócio (409/403) vêm no corpo; preservamos o código.
    const ctx = (error as unknown as { context?: { body?: unknown } }).context;
    const raw = ctx?.body;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as { error?: string; message?: string };
        // Preserva código + detalhe (ex.: PROVISION_FAILED / PROVISION_PROVIDER_CONFLICT).
        const code = parsed.error ?? error.message;
        throw new Error(parsed.message && parsed.message !== code ? `${code}: ${parsed.message}` : code);
      } catch {
        /* fallthrough */
      }
    }
    throw new Error(error.message);
  }
  if (data && typeof data === 'object' && 'error' in data) {
    const e = data as { error: string; message?: string };
    throw new Error(e.error);
  }
  return data as T;
}

export function useEvolutionProvisionedInstances(enabled = true) {
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;

  return useQuery({
    queryKey: ['evolution', 'provisioned-instances', orgId],
    enabled: enabled && !!orgId,
    refetchInterval: 5000,
    queryFn: async () => {
      const r = await callOp<{ instances: EvolutionProvisionedInstance[]; evolutionIntegration: boolean }>(
        { op: 'listInstances', organizationId: orgId },
      );
      return r;
    },
  });
}

export function useCreateEvolutionInstance() {
  const { organization } = useOrganization();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      callOp<{
        instanceId: string;
        instanceName: string;
        qr: { base64: string | null; code: string | null } | null;
      }>({ op: 'createInstance', organizationId: organization?.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evolution'] });
    },
  });
}

export function useDeleteEvolutionInstance() {
  const { organization } = useOrganization();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (instanceName: string) =>
      callOp<{ ok: true; endpointPreserved: string | null }>({
        op: 'deleteInstance',
        organizationId: organization?.id,
        instanceName,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evolution'] });
    },
  });
}

export function useSyncEvolutionWebhook() {
  const { organization } = useOrganization();
  return useMutation({
    mutationFn: async (instanceName: string) =>
      callOp<{ ok: true }>({
        op: 'syncWebhook',
        organizationId: organization?.id,
        instanceName,
      }),
  });
}

/**
 * Leitura EXPLÍCITA da identidade real (número) de uma instância recém
 * conectada. `listInstances` permanece leitura pura — nenhuma persistência
 * silenciosa acontece na listagem.
 */
export function useSyncPendingInstanceIdentity() {
  const { organization } = useOrganization();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (instanceId: string) =>
      callOp<{
        instanceId: string;
        identityKnown: boolean;
        ownerMasked: string | null;
      }>({
        op: 'syncPendingInstanceIdentity',
        organizationId: organization?.id,
        instanceId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evolution'] });
    },
  });
}

/**
 * Vincula a sessão à Route do destino escolhido, usando exclusivamente o número
 * real vindo da Evolution. Não torna o número ativo para envio.
 *
 * O destino (`purpose`) é SEMPRE enviado explicitamente por esta UI; o default
 * `commercial` do Edge existe apenas para compatibilidade de callers antigos.
 */
export interface LinkPendingInstanceInput {
  instanceId: string;
  purpose: 'commercial' | 'customer_service' | 'vendor_personal';
  assignedUserId?: string | null;
}

export function useLinkPendingInstance() {
  const { organization } = useOrganization();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: LinkPendingInstanceInput) =>
      callOp<{ ok: true; ownerMasked: string | null }>({
        op: 'linkPendingInstance',
        organizationId: organization?.id,
        instanceId: input.instanceId,
        purpose: input.purpose,
        assignedUserId: input.purpose === 'vendor_personal' ? input.assignedUserId ?? null : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evolution'] });
    },
  });
}


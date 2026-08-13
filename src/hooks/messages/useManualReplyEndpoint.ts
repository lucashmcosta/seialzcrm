// ============================================================================
// Switch "Responder por" (Comercial) — estado da UI.
//
// REGRAS
//  • Feature OFF  ⇒ nada é renderizado e NENHUMA query extra é disparada
//    (a leitura da flag reaproveita a query já existente das flags Comerciais).
//  • Feature ON   ⇒ lista SOMENTE endpoints autorizados ao usuário atual
//    (`user_reply_endpoints`), elegíveis ao Comercial
//    (`fn_is_sales_eligible_endpoint`) e da MESMA organização.
//  • Escolha manual  ⇒ `set_thread_reply_endpoint_pref` (RPC SECURITY DEFINER).
//  • Voltar Automático ⇒ `clear_thread_reply_endpoint_pref`.
//  • Nunca toca `active_endpoint_id`, `primary_endpoint_id` ou
//    `messaging_line_rotations`. Persistência é por thread + usuário.
//
// Toda a autorização é server-side (RPCs + RLS). Nada é inferido no browser.
// ============================================================================

import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSalesFeatureFlags } from './useSalesFeatureFlags';
import {
  filterWhatsAppCandidates,
  manualReplyPayloadValue,
  toManualReplyOptions,
} from '@/lib/manualReplySelection';

export interface ManualReplyOption {
  endpointId: string;
  address: string | null;
  displayName: string | null;
  provider: string | null;
  /** endpoint ativo no provider/registro — quando false, seleção é bloqueada */
  available: boolean;
}

export type ManualReplyUiState =
  | 'disabled' // feature OFF / fora do escopo Comercial
  | 'loading'
  | 'no_endpoints' // usuário sem endpoints autorizados
  | 'error' // falha de leitura/permissão
  | 'ready';

export interface ManualReplyState {
  /** true somente quando a feature está ON para a organização e o escopo é Comercial */
  enabled: boolean;
  uiState: ManualReplyUiState;
  options: ManualReplyOption[];
  /** endpoint manual persistido para (thread, usuário) — null = Automático */
  selectedEndpointId: string | null;
  selectedOption: ManualReplyOption | null;
  /** valor a enviar no payload de envio; undefined quando Automático */
  manualReplyEndpointId: string | undefined;
  isMutating: boolean;
  errorMessage: string | null;
  selectEndpoint: (endpointId: string) => Promise<void>;
  resetToAuto: () => Promise<void>;
}

interface Params {
  organizationId?: string | null;
  threadId?: string | null;
  userId?: string | null;
  businessContext?: string | null;
  channel?: string | null;
}

/** Mensagens humanas para os códigos MANUAL_REPLY_* / erros das RPCs. */
export function humanizeManualReplyError(raw: unknown): string {
  const msg = typeof raw === 'string' ? raw : ((raw as Error)?.message ?? '');
  if (msg.includes('MANUAL_REPLY_FEATURE_DISABLED'))
    return 'A escolha manual de número não está habilitada para esta organização.';
  if (msg.includes('MANUAL_REPLY_ENDPOINT_FORBIDDEN') || msg.includes('not authorized'))
    return 'Você não tem permissão para responder por este número.';
  if (msg.includes('MANUAL_REPLY_ENDPOINT_NOT_SALES') || msg.includes('not sales eligible'))
    return 'Este número não faz parte da configuração Comercial desta organização.';
  if (msg.includes('MANUAL_REPLY_THREAD_NOT_SALES') || msg.includes('not a canonical'))
    return 'Esta conversa não aceita escolha manual de número.';
  if (msg.includes('MANUAL_REPLY_ENDPOINT_INACTIVE'))
    return 'Número indisponível no momento. Escolha outro ou volte para Automático.';
  if (msg.includes('MANUAL_REPLY_ENDPOINT_CROSS_ORG'))
    return 'Número pertence a outra organização.';
  return msg || 'Não foi possível aplicar a escolha de número.';
}

export function useManualReplyEndpoint(params: Params): ManualReplyState {
  const { organizationId, threadId, userId } = params;
  const { flags, isLoading: flagsLoading } = useSalesFeatureFlags(organizationId);

  const inScope =
    (params.businessContext ?? 'sales') === 'sales' && (params.channel ?? 'whatsapp') === 'whatsapp';

  const enabled =
    flags.manualReplyEndpoint.enabledForOrg &&
    inScope &&
    !!organizationId &&
    !!threadId &&
    !!userId;

  const queryClient = useQueryClient();

  // ---- endpoints autorizados (somente com a feature ON) --------------------
  const optionsQuery = useQuery<ManualReplyOption[]>({
    queryKey: ['manual-reply-options', organizationId ?? null, userId ?? null],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_reply_endpoints')
        .select(
          'endpoint_id, communication_endpoints!inner(id, external_address, display_name, provider, is_active, channel)',
        )
        .eq('organization_id', organizationId!)
        .eq('user_id', userId!);
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        endpoint_id: string;
        communication_endpoints: {
          id: string;
          external_address: string | null;
          display_name: string | null;
          provider: string | null;
          is_active: boolean | null;
          channel: string | null;
        } | null;
      }>;

      const candidates = filterWhatsAppCandidates(rows.map((r) => r.communication_endpoints));

      // Elegibilidade Comercial é decidida no servidor, endpoint por endpoint.
      const eligibility = await Promise.all(
        candidates.map(async (ep) => {
          const { data: ok } = await supabase.rpc('fn_is_sales_eligible_endpoint', {
            _organization_id: organizationId!,
            _endpoint_id: ep.id,
          });
          return ok === true;
        }),
      );

      return toManualReplyOptions(candidates, eligibility);
    },
  });

  // ---- preferência persistida (thread + usuário) ---------------------------
  const prefQuery = useQuery<string | null>({
    queryKey: ['manual-reply-pref', threadId ?? null, userId ?? null],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('thread_reply_endpoint_prefs')
        .select('endpoint_id')
        .eq('thread_id', threadId!)
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as { endpoint_id?: string } | null)?.endpoint_id ?? null;
    },
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['manual-reply-pref', threadId ?? null, userId ?? null] });
  }, [queryClient, threadId, userId]);

  const setMutation = useMutation({
    mutationFn: async (endpointId: string) => {
      const { error } = await supabase.rpc('set_thread_reply_endpoint_pref', {
        _thread_id: threadId!,
        _endpoint_id: endpointId,
      });
      if (error) throw new Error(humanizeManualReplyError(error.message));
    },
    onSuccess: invalidate,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('clear_thread_reply_endpoint_pref', {
        _thread_id: threadId!,
      });
      if (error) throw new Error(humanizeManualReplyError(error.message));
    },
    onSuccess: invalidate,
  });

  const options = optionsQuery.data ?? [];
  const selectedEndpointId = enabled ? (prefQuery.data ?? null) : null;
  const selectedOption = useMemo(
    () => options.find((o) => o.endpointId === selectedEndpointId) ?? null,
    [options, selectedEndpointId],
  );

  const readError = optionsQuery.error ?? prefQuery.error;
  const uiState: ManualReplyUiState = !enabled
    ? 'disabled'
    : flagsLoading || optionsQuery.isLoading || prefQuery.isLoading
      ? 'loading'
      : readError
        ? 'error'
        : options.length === 0
          ? 'no_endpoints'
          : 'ready';

  return {
    enabled,
    uiState,
    options,
    selectedEndpointId,
    selectedOption,
    // Só envia o override quando a feature está ON e há preferência válida.
    manualReplyEndpointId: manualReplyPayloadValue(enabled, selectedEndpointId),
    isMutating: setMutation.isPending || clearMutation.isPending,
    errorMessage: readError
      ? humanizeManualReplyError(readError)
      : setMutation.error
        ? humanizeManualReplyError(setMutation.error)
        : clearMutation.error
          ? humanizeManualReplyError(clearMutation.error)
          : null,
    selectEndpoint: async (endpointId: string) => {
      await setMutation.mutateAsync(endpointId);
    },
    resetToAuto: async () => {
      await clearMutation.mutateAsync();
    },
  };
}

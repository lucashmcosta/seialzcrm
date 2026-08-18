// ============================================================================
// Seletor "Responder por" (Comercial) — estado da UI.
//
// REGRAS
//  • NÃO existe item "Automático". O seletor sempre mostra um NÚMERO real:
//      1. escolha manual do operador nesta conversa (se houver);
//      2. senão, endpoint da ÚLTIMA MENSAGEM VÁLIDA da conversa (inbound OU
//         outbound) — seleção "derived";
//      3. senão (conversa sem nenhuma mensagem roteável), o default legado da
//         Route (`messaging_lines.active_endpoint_id`).
//  • Visível para TODO usuário com acesso ao Comercial — não há mais gate por
//    `user_reply_endpoints`. As opções são os números WhatsApp da organização
//    elegíveis ao Comercial (`fn_is_sales_eligible_endpoint`, server-side).
//  • A escolha manual vale para a conversa aberta (sessão) e é enviada como
//    `{ source: 'manual', endpointId }`. O backend revalida e é a fonte de
//    verdade — em "derived" ele reconsulta a última mensagem no envio.
//  • Nunca toca `active_endpoint_id`, `primary_endpoint_id` ou
//    `messaging_line_rotations`.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSalesFeatureFlags } from './useSalesFeatureFlags';
import { useThreadLastEndpoint } from './useThreadLastEndpoint';
import {
  composerBlockReason,
  filterWhatsAppCandidates,
  toManualReplyOptions,
} from '@/lib/manualReplySelection';
import {
  deriveSelectedEndpoint,
  replySelectionPayload,
  type ReplyEndpointSelection,
  type ReplySelectionSource,
} from '@/lib/replyEndpointSelection';

export interface ManualReplyOption {
  endpointId: string;
  address: string | null;
  displayName: string | null;
  provider: string | null;
  /** endpoint ativo no provider/registro — quando false, seleção é bloqueada */
  available: boolean;
  /** número pessoal (`purpose = vendor_personal`) */
  isPersonal: boolean;
  assignedUserId: string | null;
  ownerName: string | null;
  /** permissão do usuário atual (server-side: `fn_can_user_use_reply_endpoint`) */
  allowedForUser: boolean;
}

export type ManualReplyUiState =
  | 'disabled' // feature OFF / fora do escopo Comercial
  | 'loading'
  | 'no_endpoints' // organização sem número Comercial elegível
  | 'error' // falha de leitura/permissão
  | 'ready';

export interface ManualReplyState {
  /** true somente quando a feature está ON para a organização e o escopo é Comercial */
  enabled: boolean;
  uiState: ManualReplyUiState;
  options: ManualReplyOption[];
  /** endpoint exibido no seletor (nunca "Automático") */
  selectedEndpointId: string | null;
  selectedOption: ManualReplyOption | null;
  /** origem da seleção atual */
  selectionSource: ReplySelectionSource;
  /** endpoint derivado da última mensagem válida (para voltar de manual → derived) */
  derivedEndpointId: string | null;
  derivedOption: ManualReplyOption | null;
  /** payload de envio: `{ source, endpointId }`; undefined quando a feature está OFF */
  replyEndpointSelection: ReplyEndpointSelection | undefined;
  isMutating: boolean;
  /** true quando o endpoint selecionado não é permitido ao usuário atual */
  composerBlocked: boolean;
  composerBlockReason: 'personal_other_user' | 'none_allowed' | null;
  /** placeholder acordado para o composer bloqueado */
  composerBlockedPlaceholder: string | null;
  errorMessage: string | null;
  selectEndpoint: (endpointId: string) => Promise<void>;
  /** volta para a seleção derivada (endpoint da última mensagem da conversa) */
  useDerived: () => Promise<void>;
}

interface Params {
  organizationId?: string | null;
  threadId?: string | null;
  userId?: string | null;
  businessContext?: string | null;
  channel?: string | null;
  /** default legado da Route, usado apenas quando a conversa não tem mensagens */
  routeDefaultEndpointId?: string | null;
}

/** Mensagens humanas para os códigos MANUAL_REPLY_* / erros das RPCs. */
export function humanizeManualReplyError(raw: unknown): string {
  const msg = typeof raw === 'string' ? raw : ((raw as Error)?.message ?? '');
  if (msg.includes('MANUAL_REPLY_FEATURE_DISABLED'))
    return 'A escolha manual de número não está habilitada para esta organização.';
  if (msg.includes('MANUAL_REPLY_ENDPOINT_FORBIDDEN'))
    return 'Não foi possível responder por este número.';
  if (msg.includes('MANUAL_REPLY_ENDPOINT_NOT_SALES') || msg.includes('not sales eligible'))
    return 'Este número não faz parte da configuração Comercial desta organização.';
  if (msg.includes('MANUAL_REPLY_THREAD_NOT_SALES') || msg.includes('not a canonical'))
    return 'Esta conversa não aceita escolha manual de número.';
  if (msg.includes('MANUAL_REPLY_ENDPOINT_INACTIVE'))
    return 'Número indisponível no momento. Escolha outro número.';
  if (msg.includes('REPLY_ENDPOINT_PERSONAL_FORBIDDEN'))
    return 'Este número é pessoal de outro usuário. Escolha um número permitido para responder.';
  if (msg.includes('REPLY_ENDPOINT_NONE_ALLOWED'))
    return 'Nenhum número permitido para responder nesta conversa.';
  if (msg.includes('MANUAL_REPLY_ENDPOINT_CROSS_ORG'))
    return 'Número de outra organização.';
  if (msg.includes('MANUAL_REPLY_ENDPOINT_OFFLINE'))
    return 'Número desconectado no provedor. Escolha outro número.';
  if (msg.includes('MANUAL_REPLY_ENDPOINT_IDENTITY'))
    return 'Identidade do número não confirmada no provedor.';
  return msg || 'Não foi possível aplicar a escolha de número.';
}

export function useManualReplyEndpoint(params: Params): ManualReplyState {
  const {
    organizationId,
    threadId,
    userId,
    businessContext,
    channel = 'whatsapp',
    routeDefaultEndpointId = null,
  } = params;

  const { flags, isLoading: flagsLoading } = useSalesFeatureFlags(organizationId);
  const inScope = businessContext === 'sales' && channel === 'whatsapp';
  const enabled =
    flags.manualReplyEndpoint.enabledForOrg && inScope && !!organizationId && !!threadId && !!userId;

  // ---- números Comerciais elegíveis da ORGANIZAÇÃO (sem gate por usuário) ----
  const optionsQuery = useQuery<ManualReplyOption[]>({
    queryKey: ['sales-reply-endpoints', organizationId ?? null, userId ?? null],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communication_endpoints')
        .select('id, external_address, display_name, provider, is_active, channel, purpose, assigned_user_id')
        .eq('organization_id', organizationId!)
        .eq('channel', 'whatsapp')
        .eq('is_active', true);
      if (error) throw error;

      const candidates = filterWhatsAppCandidates(
        (data ?? []) as Array<Parameters<typeof filterWhatsAppCandidates>[0][number]>,
      );

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

      // Permissão por usuário (Fase 2 — números pessoais). Validador único
      // compartilhado com o backend; fail-closed em qualquer erro.
      const allowed = await Promise.all(
        candidates.map(async (ep) => {
          const { data: ok } = await supabase.rpc('fn_can_user_use_reply_endpoint', {
            _organization_id: organizationId!,
            _user_id: userId!,
            _endpoint_id: ep.id,
          });
          return ok === true;
        }),
      );

      // Nome do dono, para exibir "Pessoal · Junior" sem esconder o contexto.
      const ownerIds = Array.from(
        new Set(candidates.map((ep) => ep.assigned_user_id).filter((v): v is string => !!v)),
      );
      const ownerNames: Record<string, string | null> = {};
      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from('users')
          .select('id, full_name')
          .in('id', ownerIds);
        for (const o of owners ?? []) ownerNames[o.id] = o.full_name ?? null;
      }

      return toManualReplyOptions(candidates, eligibility, { allowed, ownerNames });
    },
  });

  // ---- seleção derivada: endpoint da última mensagem válida da conversa ----
  const {
    lastEndpointId,
    lastMessageId,
    isLoading: lastLoading,
    error: lastError,
  } = useThreadLastEndpoint({ threadId, enabled });

  // ---- escolha manual do operador, por conversa (sessão) ----
  const [manualByThread, setManualByThread] = useState<Record<string, string>>({});
  const manualEndpointId = threadId ? (manualByThread[threadId] ?? null) : null;
  const previousLastMessageByThread = useRef<Record<string, string | null>>({});

  // Uma nova mensagem válida encerra qualquer escolha manual transitória.
  // A identidade da mensagem (não apenas o endpoint) cobre inclusive inbound
  // novo recebido pelo mesmo número escolhido manualmente.
  useEffect(() => {
    if (!threadId || !lastMessageId) return;
    const previous = previousLastMessageByThread.current[threadId];
    previousLastMessageByThread.current[threadId] = lastMessageId;
    if (previous === undefined || previous === lastMessageId) return;
    setManualByThread((current) => {
      if (!current[threadId]) return current;
      const next = { ...current };
      delete next[threadId];
      return next;
    });
  }, [lastMessageId, threadId]);

  const options = useMemo(() => optionsQuery.data ?? [], [optionsQuery.data]);
  const derivedEndpointId = enabled ? (lastEndpointId ?? routeDefaultEndpointId ?? null) : null;

  const selection = useMemo(
    () =>
      deriveSelectedEndpoint({
        manualEndpointId: enabled ? manualEndpointId : null,
        lastMessageEndpointId: lastEndpointId,
        routeDefaultEndpointId,
      }),
    [enabled, manualEndpointId, lastEndpointId, routeDefaultEndpointId],
  );

  const findOption = useCallback(
    (id: string | null) => options.find((o) => o.endpointId === id) ?? null,
    [options],
  );

  const readError = optionsQuery.error ?? lastError;
  const uiState: ManualReplyUiState = !enabled
    ? 'disabled'
    : flagsLoading || optionsQuery.isLoading || lastLoading
      ? 'loading'
      : readError
        ? 'error'
        : options.length === 0
          ? 'no_endpoints'
          : 'ready';

  const [localError, setLocalError] = useState<string | null>(null);

  const blockReason = useMemo(
    () =>
      uiState === 'ready'
        ? composerBlockReason(findOption(selection.endpointId), options)
        : null,
    [uiState, findOption, selection.endpointId, options],
  );

  const selectEndpoint = useCallback(
    async (endpointId: string) => {
      if (!threadId) return;
      const option = options.find((o) => o.endpointId === endpointId);
      if (option && !option.allowedForUser) {
        const msg = option.isPersonal
          ? `Este número é pessoal${option.ownerName ? ` de ${option.ownerName}` : ''}. Escolha um número permitido para responder.`
          : 'Você não tem permissão para responder por este número.';
        setLocalError(msg);
        throw new Error(msg);
      }
      if (!option || !option.available) {
        const msg = 'Número indisponível no momento. Escolha outro número.';
        setLocalError(msg);
        throw new Error(msg);
      }
      setLocalError(null);
      setManualByThread((prev) => ({ ...prev, [threadId]: endpointId }));
    },
    [options, threadId],
  );

  const useDerived = useCallback(async () => {
    if (!threadId) return;
    setLocalError(null);
    setManualByThread((prev) => {
      const next = { ...prev };
      delete next[threadId];
      return next;
    });
  }, [threadId]);

  return {
    enabled,
    uiState,
    options,
    selectedEndpointId: selection.endpointId,
    selectedOption: findOption(selection.endpointId),
    selectionSource: selection.source,
    derivedEndpointId,
    derivedOption: findOption(derivedEndpointId),
    replyEndpointSelection: replySelectionPayload(enabled, selection),
    isMutating: false,
    composerBlocked: blockReason !== null,
    composerBlockReason: blockReason,
    composerBlockedPlaceholder:
      blockReason !== null ? 'Escolha um número permitido para responder.' : null,
    errorMessage: readError ? humanizeManualReplyError(readError) : localError,
    selectEndpoint,
    useDerived,
  };
}

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Metadados de EXIBIÇÃO do endpoint de uma thread (badge da lista lateral). */
export interface ThreadBadgeEndpoint {
  endpointId: string | null;
  address: string | null;
  provider: string | null;
  isActive: boolean | null;
}

/**
 * Resolve, POR THREAD, o endpoint que deve ser exibido no badge da lista de
 * conversas. Puramente apresentacional — nunca alimenta envio, route,
 * `active_endpoint_id` nem o seletor "Responder por".
 *
 * Prioridade de leitura (alinhada ao comportamento do "Responder por", que
 * segue a última mensagem da conversa):
 *   1. `endpoint_id` da última mensagem da thread (`last_message_id`);
 *   2. `primary_endpoint_id` como fallback;
 *   3. sem endpoint identificável -> sem badge.
 *
 * Os metadados vêm direto de `communication_endpoints` SEM os filtros de
 * `sender_sid`/`status` do mundo Twilio/Meta — endpoints Evolution têm
 * `sender_sid` nulo e `status = 'unknown'` e precisam exibir o número igual
 * a qualquer outro provider.
 */
export function useThreadBadgeEndpoints(
  threadIds: string[],
  enabled: boolean,
): Record<string, ThreadBadgeEndpoint> {
  const [map, setMap] = useState<Record<string, ThreadBadgeEndpoint>>({});

  const key = enabled ? threadIds.slice().sort().join(',') : '';

  useEffect(() => {
    if (!enabled || threadIds.length === 0) {
      setMap({});
      return;
    }
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('message_threads')
        .select('id, primary_endpoint_id, last_message_id')
        .in('id', threadIds);

      if (cancelled) return;
      if (error) {
        console.warn('[useThreadBadgeEndpoints] threads load failed', error.message);
        return;
      }

      const rows = (data ?? []) as any[];

      // (1) endpoint da última mensagem da conversa.
      const lastMessageIds = rows
        .map((r) => r.last_message_id)
        .filter((id): id is string => !!id);

      const endpointByMessageId: Record<string, string> = {};
      if (lastMessageIds.length > 0) {
        const { data: msgs, error: msgError } = await supabase
          .from('messages')
          .select('id, endpoint_id')
          .in('id', lastMessageIds);
        if (cancelled) return;
        if (msgError) {
          console.warn('[useThreadBadgeEndpoints] messages load failed', msgError.message);
        } else {
          for (const m of (msgs ?? []) as any[]) {
            if (m.endpoint_id) endpointByMessageId[m.id] = m.endpoint_id;
          }
        }
      }

      // (2) fallback: primary_endpoint_id.
      const endpointIdByThread: Record<string, string | null> = {};
      for (const row of rows) {
        const fromLastMessage = row.last_message_id
          ? endpointByMessageId[row.last_message_id] ?? null
          : null;
        endpointIdByThread[row.id] = fromLastMessage ?? row.primary_endpoint_id ?? null;
      }

      // Tradução id -> número/provider/estado (sem filtro por provider).
      const endpointIds = Array.from(
        new Set(Object.values(endpointIdByThread).filter((id): id is string => !!id)),
      );

      const metaById: Record<string, ThreadBadgeEndpoint> = {};
      if (endpointIds.length > 0) {
        const { data: eps, error: epError } = await supabase
          .from('communication_endpoints')
          .select('id, external_address, provider, is_active')
          .in('id', endpointIds);
        if (cancelled) return;
        if (epError) {
          console.warn('[useThreadBadgeEndpoints] endpoints load failed', epError.message);
        } else {
          for (const ep of (eps ?? []) as any[]) {
            metaById[ep.id] = {
              endpointId: ep.id,
              address: ep.external_address ?? null,
              provider: ep.provider ?? null,
              isActive: ep.is_active ?? null,
            };
          }
        }
      }

      const next: Record<string, ThreadBadgeEndpoint> = {};
      for (const [threadId, endpointId] of Object.entries(endpointIdByThread)) {
        next[threadId] = (endpointId && metaById[endpointId]) || {
          endpointId: endpointId ?? null,
          address: null,
          provider: null,
          isActive: null,
        };
      }

      setMap(next);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return map;
}

// ============================================================================
// Preview em LOTE da última mensagem das threads visíveis (lista lateral).
//
// Somente leitura/apresentação: nada de envio, rota, thread ou realtime novo.
// Uma única query em `messages` por página visível, seguindo o mesmo padrão de
// `useThreadBadgeEndpoints`. A chave do efeito deriva de `last_message_id` +
// `updated_at` da thread; como qualquer mudança de status em `messages` dispara
// UPDATE em `message_threads` (trigger `fn_update_thread_last_message`), o
// realtime já existente faz o preview e os checks recarregarem sem reload.
// ============================================================================

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ThreadLastMessage {
  content: string | null;
  mediaType: string | null;
  direction: string | null;
  senderUserId: string | null;
  status: string | null;
  errorCode: string | null;
}

export function useThreadLastMessagePreviews(
  threads: Array<{ id: string; last_message_id?: string | null; updated_at?: string | null }>,
  enabled: boolean,
): Record<string, ThreadLastMessage> {
  const [map, setMap] = useState<Record<string, ThreadLastMessage>>({});

  const pairs = threads
    .filter((t) => !!t.last_message_id)
    .map((t) => `${t.id}:${t.last_message_id}`)
    .sort();
  // Chave inclui updated_at para refletir transições sent → delivered → read.
  const key = enabled
    ? threads
        .filter((t) => !!t.last_message_id)
        .map((t) => `${t.id}:${t.last_message_id}:${t.updated_at ?? ''}`)
        .sort()
        .join(',')
    : '';

  useEffect(() => {
    if (!enabled || pairs.length === 0) {
      setMap({});
      return;
    }
    let cancelled = false;

    (async () => {
      const messageIdByThread = new Map<string, string>();
      for (const pair of pairs) {
        const idx = pair.indexOf(':');
        messageIdByThread.set(pair.slice(0, idx), pair.slice(idx + 1));
      }
      const messageIds = Array.from(new Set(messageIdByThread.values()));

      const { data, error } = await supabase
        .from('messages')
        .select('id, content, media_type, direction, sender_user_id, whatsapp_status, error_code')
        .in('id', messageIds);

      if (cancelled) return;
      if (error) {
        console.warn('[useThreadLastMessagePreviews] load failed', error.message);
        return;
      }

      const byMessageId: Record<string, ThreadLastMessage> = {};
      for (const m of (data ?? []) as any[]) {
        byMessageId[m.id] = {
          content: m.content ?? null,
          mediaType: m.media_type ?? null,
          direction: m.direction ?? null,
          senderUserId: m.sender_user_id ?? null,
          status: m.whatsapp_status ?? null,
          errorCode: m.error_code ?? null,
        };
      }

      const next: Record<string, ThreadLastMessage> = {};
      for (const [threadId, messageId] of messageIdByThread) {
        const row = byMessageId[messageId];
        if (row) next[threadId] = row;
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

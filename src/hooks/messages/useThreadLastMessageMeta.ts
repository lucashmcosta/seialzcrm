import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Metadados da ÚLTIMA mensagem de uma thread (uso puramente apresentacional). */
export interface LastMessageMeta {
  mediaType: string | null;
  whatsappStatus: string | null;
  direction: string | null;
}

/**
 * Resolve em UMA ÚNICA query os metadados das últimas mensagens (por
 * `message_threads.last_message_id`) das threads visíveis na lista.
 *
 * Mapa retornado é indexado por `message.id` (= `last_message_id`).
 * Nunca faz query por thread e não toca em paginação/rolagem da lista.
 */
export function useThreadLastMessageMeta(
  lastMessageIds: (string | null | undefined)[],
  enabled: boolean,
): Record<string, LastMessageMeta> {
  const [map, setMap] = useState<Record<string, LastMessageMeta>>({});

  const ids = Array.from(
    new Set(lastMessageIds.filter((id): id is string => !!id)),
  ).sort();
  const key = enabled ? ids.join(',') : '';

  useEffect(() => {
    if (!enabled || ids.length === 0) {
      setMap({});
      return;
    }
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, media_type, whatsapp_status, direction')
        .in('id', ids);

      if (cancelled) return;
      if (error) {
        console.warn('[useThreadLastMessageMeta] load failed', error.message);
        return;
      }

      const next: Record<string, LastMessageMeta> = {};
      for (const row of (data ?? []) as any[]) {
        next[row.id as string] = {
          mediaType: (row.media_type as string | null) ?? null,
          whatsappStatus: (row.whatsapp_status as string | null) ?? null,
          direction: (row.direction as string | null) ?? null,
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

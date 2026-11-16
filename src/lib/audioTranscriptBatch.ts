// Agrupa os pedidos de transcrição feitos no mesmo instante numa única chamada (evita N+1 no /inbox).
import { supabase } from '@/integrations/supabase/client';

export type TranscriptRow = { message_id: string; transcript: string | null; created_at: string };
export type TranscriptFetcher = (ids: string[]) => Promise<TranscriptRow[]>;

const CHUNK = 100;

export function createTranscriptLoader(fetcher: TranscriptFetcher) {
  let queue = new Map<string, { resolve: (v: string | null) => void; reject: (e: unknown) => void }[]>();
  let scheduled = false;

  const flush = async () => {
    const batch = queue;
    queue = new Map();
    scheduled = false;
    const ids = [...batch.keys()];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      try {
        const rows = await fetcher(chunk);
        const latest = new Map<string, TranscriptRow>();
        for (const r of rows) {
          const cur = latest.get(r.message_id);
          if (!cur || r.created_at > cur.created_at) latest.set(r.message_id, r);
        }
        for (const id of chunk) {
          const v = latest.get(id)?.transcript ?? null;
          batch.get(id)!.forEach((p) => p.resolve(v));
        }
      } catch (e) {
        for (const id of chunk) batch.get(id)!.forEach((p) => p.reject(e));
      }
    }
  };

  return (messageId: string) =>
    new Promise<string | null>((resolve, reject) => {
      const list = queue.get(messageId) ?? [];
      list.push({ resolve, reject });
      queue.set(messageId, list);
      if (!scheduled) {
        scheduled = true;
        setTimeout(flush, 0);
      }
    });
}

export const loadTranscript = createTranscriptLoader(async (ids) => {
  const { data, error } = await supabase
    .from('audio_transcriptions')
    .select('message_id, transcript, created_at')
    .in('message_id', ids)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TranscriptRow[];
});

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface InboxMessageRow {
  id: string;
  thread_id: string;
  content: string | null;
  direction: string | null;
  sent_at: string;
  whatsapp_status: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  error_code: string | null;
  error_message: string | null;
  reply_to_message_id: string | null;
  sender_type: string | null;
  sender_name: string | null;
  sender_agent_id: string | null;
  is_internal_note: boolean | null;
  reply_to_message?: { content: string | null; direction: string | null } | null;
}

const SELECT = `
  id, thread_id, content, direction, sent_at,
  whatsapp_status, media_urls, media_type,
  error_code, error_message,
  reply_to_message_id, sender_type, sender_name, sender_agent_id,
  is_internal_note,
  reply_to_message:reply_to_message_id ( content, direction )
`;

export function useInboxThreadMessages(threadId: string | null) {
  const [messages, setMessages] = useState<InboxMessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!threadId) { setMessages([]); return; }
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('messages')
      .select(SELECT)
      .eq('thread_id', threadId)
      .is('deleted_at', null)
      .order('sent_at', { ascending: true })
      .limit(500);
    if (error) {
      console.error('[useInboxThreadMessages]', error);
      setError(error.message);
      setMessages([]);
    } else {
      setMessages((data ?? []) as unknown as InboxMessageRow[]);
    }
    setLoading(false);
  }, [threadId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`inbox-msgs-${threadId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        setMessages((prev) => {
          const row = payload.new as InboxMessageRow;
          if (prev.some((m) => m.id === row.id)) return prev;
          return [...prev, row];
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        const row = payload.new as InboxMessageRow;
        setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [threadId]);

  return { messages, loading, error, refresh: fetchMessages };
}

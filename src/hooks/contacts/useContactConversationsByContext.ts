import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type BusinessContext = 'sales' | 'customer_service';

export interface ContextThreadRow {
  id: string;
  business_context: BusinessContext | null;
  primary_endpoint_id: string | null;
  status: string | null;
  assigned_user_id: string | null;
  last_message_at: string | null;
  last_message_content: string | null;
  last_message_direction: string | null;
  created_at: string;
  endpoint?: {
    id: string;
    external_address: string | null;
    provider: string | null;
    purpose: string | null;
  } | null;
  assigned_user_name?: string | null;
  message_count?: number;
  real_message_count?: number;
  last_real_message_at?: string | null;
}

export interface ContactConversationsResult {
  sales: ContextThreadRow | null;
  customer_service: ContextThreadRow | null;
}

/**
 * Escolhe o thread representante para um dado contexto:
 * 1. Prefere threads com mensagens reais no banco.
 * 2. Entre elas, maior last_message_at real/denormalizado.
 * 3. Empate: maior created_at.
 * 4. Se nenhuma com mensagem, retorna a mais recente por created_at.
 */
function pickRepresentative(rows: ContextThreadRow[]): ContextThreadRow | null {
  if (rows.length === 0) return null;
  const withMsgs = rows.filter((r) => (r.real_message_count ?? 0) > 0);
  const pool = withMsgs.length > 0 ? withMsgs : rows;
  return [...pool].sort((a, b) => {
    const aKey = a.last_real_message_at ?? (withMsgs.length > 0 ? a.last_message_at : null) ?? a.created_at;
    const bKey = b.last_real_message_at ?? (withMsgs.length > 0 ? b.last_message_at : null) ?? b.created_at;
    return bKey.localeCompare(aKey);
  })[0] ?? null;
}

export function useContactConversationsByContext(contactId: string | null | undefined) {
  return useQuery<ContactConversationsResult>({
    queryKey: ['contact-conversations-by-context', contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const empty: ContactConversationsResult = { sales: null, customer_service: null };
      if (!contactId) return empty;

      const { data: threadRows, error } = await supabase
        .from('message_threads')
        .select(
          'id, business_context, primary_endpoint_id, status, assigned_user_id, last_message_at, last_message_content, last_message_direction, created_at',
        )
        .eq('contact_id', contactId)
        .eq('channel', 'whatsapp')
        .in('business_context', ['sales', 'customer_service']);

      if (error) {
        console.error('[useContactConversationsByContext]', error);
        return empty;
      }

      const rows = (threadRows ?? []) as ContextThreadRow[];

      // Blindagem contra duplicatas vazias: a escolha do card deve ser guiada
      // pelas mensagens reais, não só por updated_at/status da thread.
      const threadIds = rows.map((r) => r.id);
      if (threadIds.length > 0) {
        const { data: messageRows, error: msgError } = await supabase
          .from('messages')
          .select('thread_id, content, direction, sent_at, created_at, is_internal_note')
          .in('thread_id', threadIds)
          .is('deleted_at', null)
          .in('direction', ['inbound', 'outbound'])
          .or('is_internal_note.is.false,is_internal_note.is.null')
          .order('sent_at', { ascending: false });

        if (!msgError) {
          const messageStats = new Map<
            string,
            { count: number; last_at: string | null; last_content: string | null; last_direction: string | null }
          >();

          for (const msg of (messageRows ?? []) as any[]) {
            const threadId = msg.thread_id as string;
            const current = messageStats.get(threadId) ?? {
              count: 0,
              last_at: null,
              last_content: null,
              last_direction: null,
            };
            current.count += 1;

            const msgAt = (msg.sent_at ?? msg.created_at ?? null) as string | null;
            if (msgAt && (!current.last_at || msgAt > current.last_at)) {
              current.last_at = msgAt;
              current.last_content = (msg.content ?? null) as string | null;
              current.last_direction = (msg.direction ?? null) as string | null;
            }
            messageStats.set(threadId, current);
          }

          for (const row of rows) {
            const stats = messageStats.get(row.id);
            row.message_count = stats?.count ?? 0;
            row.real_message_count = stats?.count ?? 0;
            row.last_real_message_at = stats?.last_at ?? null;
            if (stats?.last_at) {
              row.last_message_at = stats.last_at;
              row.last_message_content = stats.last_content;
              row.last_message_direction = stats.last_direction;
            }
          }
        } else {
          console.error('[useContactConversationsByContext] messages lookup', msgError);
        }
      }

      const sales = pickRepresentative(rows.filter((r) => r.business_context === 'sales'));
      const cs = pickRepresentative(rows.filter((r) => r.business_context === 'customer_service'));

      // Enriquecer com endpoint + usuário responsável
      const endpointIds = Array.from(
        new Set([sales?.primary_endpoint_id, cs?.primary_endpoint_id].filter(Boolean) as string[]),
      );
      const userIds = Array.from(
        new Set([sales?.assigned_user_id, cs?.assigned_user_id].filter(Boolean) as string[]),
      );

      const [endpointsRes, usersRes] = await Promise.all([
        endpointIds.length
          ? supabase
              .from('communication_endpoints')
              .select('id, external_address, provider, purpose')
              .in('id', endpointIds)
          : Promise.resolve({ data: [], error: null } as any),
        userIds.length
          ? supabase.from('users').select('id, full_name').in('id', userIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const epMap = new Map<string, ContextThreadRow['endpoint']>();
      for (const ep of (endpointsRes.data ?? []) as any[]) {
        epMap.set(ep.id, ep);
      }
      const uMap = new Map<string, string | null>();
      for (const u of (usersRes.data ?? []) as any[]) {
        uMap.set(u.id, u.full_name ?? null);
      }

      const decorate = (r: ContextThreadRow | null): ContextThreadRow | null => {
        if (!r) return null;
        return {
          ...r,
          endpoint: r.primary_endpoint_id ? epMap.get(r.primary_endpoint_id) ?? null : null,
          assigned_user_name: r.assigned_user_id ? uMap.get(r.assigned_user_id) ?? null : null,
        };
      };

      return { sales: decorate(sales), customer_service: decorate(cs) };
    },
  });
}

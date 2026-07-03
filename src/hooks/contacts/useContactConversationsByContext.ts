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
}

export interface ContactConversationsResult {
  sales: ContextThreadRow | null;
  customer_service: ContextThreadRow | null;
}

/**
 * Escolhe o thread representante para um dado contexto:
 * 1. Prefere threads com mensagens (last_message_at != null).
 * 2. Entre elas, maior last_message_at.
 * 3. Empate: maior created_at.
 * 4. Se nenhuma com mensagem, retorna a mais recente por created_at.
 */
function pickRepresentative(rows: ContextThreadRow[]): ContextThreadRow | null {
  if (rows.length === 0) return null;
  const withMsgs = rows.filter((r) => !!r.last_message_at);
  const pool = withMsgs.length > 0 ? withMsgs : rows;
  return [...pool].sort((a, b) => {
    const aKey = a.last_message_at ?? a.created_at;
    const bKey = b.last_message_at ?? b.created_at;
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
        .in('business_context', ['sales', 'customer_service'])
        .is('deleted_at', null);

      if (error) {
        console.error('[useContactConversationsByContext]', error);
        return empty;
      }

      const rows = (threadRows ?? []) as ContextThreadRow[];
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

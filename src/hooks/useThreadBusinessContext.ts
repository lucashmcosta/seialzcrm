// Lightweight read of message_threads.business_context for the composer
// layer. Cached 60s. Returns null while loading OR when the column itself
// is null (fallback threads).
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ThreadBusinessContext = 'sales' | 'customer_service' | 'other' | null;

export function useThreadBusinessContext(threadId?: string | null): ThreadBusinessContext {
  const { data } = useQuery({
    queryKey: ['thread-business-context', threadId ?? null],
    enabled: !!threadId,
    staleTime: 60_000,
    queryFn: async (): Promise<ThreadBusinessContext> => {
      if (!threadId) return null;
      const { data, error } = await supabase
        .from('message_threads')
        .select('business_context')
        .eq('id', threadId)
        .maybeSingle();
      if (error) {
        console.warn('[useThreadBusinessContext] load failed', error.message);
        return null;
      }
      const bc = (data as any)?.business_context as string | null | undefined;
      if (bc === 'sales' || bc === 'customer_service' || bc === 'other') return bc;
      return null;
    },
  });
  return (data ?? null) as ThreadBusinessContext;
}

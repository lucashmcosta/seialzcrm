// Fetch active snippets for an organization filtered by endpoint purpose.
// Sorted: usage_count DESC, title ASC.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MessageSnippet {
  id: string;
  organization_id: string;
  title: string;
  shortcut: string | null;
  body: string;
  category: string | null;
  allowed_purposes: string[];
  is_active: boolean;
  usage_count: number;
  last_used_at: string | null;
}

interface Args {
  organizationId?: string | null;
  purpose?: string | null;
}

export function useSnippets({ organizationId, purpose }: Args) {
  const [snippets, setSnippets] = useState<MessageSnippet[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSnippets = useCallback(async () => {
    if (!organizationId || !purpose) {
      setSnippets([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('message_snippets' as any)
      .select('id, organization_id, title, shortcut, body, category, allowed_purposes, is_active, usage_count, last_used_at')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .contains('allowed_purposes', [purpose])
      .order('usage_count', { ascending: false })
      .order('title', { ascending: true });
    if (error) {
      console.warn('[useSnippets] fetch failed', error.message);
      setSnippets([]);
    } else {
      setSnippets((data ?? []) as unknown as MessageSnippet[]);
    }
    setLoading(false);
  }, [organizationId, purpose]);

  useEffect(() => { fetchSnippets(); }, [fetchSnippets]);

  return { snippets, loading, refetch: fetchSnippets };
}

/** Update usage counters. Fail-open — non-blocking for the send flow. */
export async function bumpSnippetUsage(snippetId: string) {
  try {
    const { data } = await supabase
      .from('message_snippets' as any)
      .select('usage_count')
      .eq('id', snippetId)
      .maybeSingle();
    const current = (data as any)?.usage_count ?? 0;
    await supabase
      .from('message_snippets' as any)
      .update({ usage_count: current + 1, last_used_at: new Date().toISOString() })
      .eq('id', snippetId);
  } catch (e) {
    console.warn('[bumpSnippetUsage] failed', (e as Error).message);
  }
}

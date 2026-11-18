// Lista de conversas do Comercial (v2): 50 por vez + contador total com os MESMOS filtros.
// Atualização em tempo real: quando uma conversa muda, pergunta ao servidor se ela ainda
// pertence à lista filtrada (filtro thread_ids) — entra, sai ou atualiza sem recarregar tudo.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import type { ChatThread } from '@/hooks/useMessageThreads';
import { type CommercialThreadFilters, toRpcFilters } from '@/lib/commercialThreadFilters';

export interface OppTag { id: string; name: string; color: string | null }

export interface CommercialChatThread extends ChatThread {
  ai_agent_name: string | null;
  open_opportunity_id: string | null;
  open_stage_id: string | null;
  open_stage_name: string | null;
  open_opportunity_tags: OppTag[];
}

interface RowV2 {
  id: string; contact_id: string; contact_name: string | null; contact_phone: string | null; status: string | null;
  last_message_id: string | null; last_message_content: string | null; last_message_direction: string | null;
  last_message_at: string | null; last_inbound_at: string | null; whatsapp_last_inbound_at: string | null;
  needs_human_attention: boolean; assigned_user_id: string | null; assigned_user_name: string | null;
  updated_at: string; created_at: string; is_unread: boolean; ai_agent_name: string | null;
  open_opportunity_id: string | null; open_stage_id: string | null; open_stage_name: string | null; open_opportunity_tags: OppTag[] | null;
}

function mapRow(r: RowV2): CommercialChatThread {
  return {
    id: r.id,
    contact_id: r.contact_id,
    contact_name: r.contact_name || 'Desconhecido',
    contact_phone: r.contact_phone,
    last_message: r.last_message_content || '...',
    last_message_id: r.last_message_id,
    last_message_direction: r.last_message_direction,
    updated_at: r.updated_at,
    last_message_at: r.last_message_at,
    created_at: r.created_at,
    whatsapp_last_inbound_at: r.whatsapp_last_inbound_at,
    last_inbound_at: r.last_inbound_at,
    unread: r.is_unread,
    needs_human_attention: r.needs_human_attention,
    status: r.status || 'open',
    assigned_user_id: r.assigned_user_id,
    assigned_user_name: r.assigned_user_name,
    ai_agent_name: r.ai_agent_name,
    open_opportunity_id: r.open_opportunity_id,
    open_stage_id: r.open_stage_id,
    open_stage_name: r.open_stage_name,
    open_opportunity_tags: Array.isArray(r.open_opportunity_tags) ? r.open_opportunity_tags : [],
  };
}

const sortKey = (t: CommercialChatThread) => t.last_message_at || t.created_at || '';
const REALTIME_FLUSH_MS = 400;
const COUNT_DEBOUNCE_MS = 1500;
const VISIBILITY_REFETCH_MS = 60_000;

export function useCommercialThreads(filters: CommercialThreadFilters, opts: { limit?: number; enabled?: boolean } = {}) {
  const limit = opts.limit ?? 50;
  const enabled = opts.enabled ?? true;
  const { organization, userProfile } = useOrganization();
  const orgId = organization?.id;
  const userId = userProfile?.id;
  const filtersKey = JSON.stringify(toRpcFilters(filters));

  const [threads, setThreads] = useState<CommercialChatThread[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef(0);
  const reqSeq = useRef(0);

  const fetchCount = useCallback(async () => {
    if (!orgId) return;
    const { data, error: e } = await supabase.rpc('rpc_count_message_threads_v2' as never, {
      p_organization_id: orgId, p_filters: JSON.parse(filtersKey),
    } as never);
    if (!e && data !== null && data !== undefined) setTotal(Number(data));
  }, [orgId, filtersKey]);

  const fetchThreads = useCallback(async () => {
    if (!orgId) return;
    const seq = ++reqSeq.current;
    try {
      const { data, error: e } = await supabase.rpc('rpc_list_message_threads_v2' as never, {
        p_organization_id: orgId, p_filters: JSON.parse(filtersKey), p_limit: limit,
      } as never);
      if (seq !== reqSeq.current) return; // resposta antiga (filtro mudou no meio)
      if (e) {
        if (e.message?.includes('ACCESS_DENIED') || e.code === 'P0002') { setError('ACCESS_DENIED'); setThreads([]); return; }
        throw e;
      }
      const rows = ((data as unknown as RowV2[]) || []).map(mapRow);
      setThreads(rows);
      setHasMore(rows.length >= limit);
      setError(null);
      lastFetchRef.current = Date.now();
    } catch (err) {
      console.error('Error fetching commercial threads:', err);
      if (seq === reqSeq.current) setError((err as Error).message || 'UNKNOWN_ERROR');
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
    fetchCount();
  }, [orgId, filtersKey, limit, fetchCount]);

  const loadMore = useCallback(async () => {
    if (!orgId || !hasMore || loadingMore) return;
    const last = threads[threads.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const { data, error: e } = await supabase.rpc('rpc_list_message_threads_v2' as never, {
        p_organization_id: orgId, p_filters: JSON.parse(filtersKey), p_limit: limit,
        p_cursor_updated_at: last.last_message_at ?? last.created_at, p_cursor_id: last.id,
      } as never);
      if (e) throw e;
      const rows = ((data as unknown as RowV2[]) || []).map(mapRow);
      setThreads((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id))];
      });
      setHasMore(rows.length >= limit);
    } catch (err) {
      console.error('Error loading more commercial threads:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [orgId, hasMore, loadingMore, threads, filtersKey, limit]);

  // ── Tempo real: confere no servidor se as conversas alteradas ainda entram no filtro ──
  const pendingIds = useRef<Set<string>>(new Set());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (!orgId) return;
    const ids = Array.from(pendingIds.current);
    pendingIds.current.clear();
    if (!ids.length) return;
    const { data, error: e } = await supabase.rpc('rpc_list_message_threads_v2' as never, {
      p_organization_id: orgId, p_filters: { ...JSON.parse(filtersKey), thread_ids: ids }, p_limit: ids.length,
    } as never);
    if (e) { console.error('Error refreshing threads:', e); return; }
    const fresh = ((data as unknown as RowV2[]) || []).map(mapRow);
    setThreads((prev) => {
      // Sai quem não pertence mais ao filtro; entra/atualiza quem pertence.
      const rest = prev.filter((t) => !ids.includes(t.id));
      const merged = [...fresh, ...rest];
      merged.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
      return merged;
    });
    if (countTimer.current) clearTimeout(countTimer.current);
    countTimer.current = setTimeout(() => { fetchCount(); }, COUNT_DEBOUNCE_MS);
  }, [orgId, filtersKey, fetchCount]);

  const schedule = useCallback((id: string, channel?: string) => {
    if (channel && channel !== 'whatsapp') return;
    pendingIds.current.add(id);
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => { flush(); }, REALTIME_FLUSH_MS);
  }, [flush]);

  useEffect(() => {
    if (!enabled) return;
    if (!orgId || !userId) { setThreads([]); setTotal(null); setLoading(false); return; }
    setLoading(true);
    setTotal(null);
    fetchThreads();
  }, [enabled, orgId, userId, fetchThreads]);

  useEffect(() => {
    if (!enabled || !orgId) return;
    const ch = supabase
      .channel(`commercial-threads-${orgId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_threads', filter: `organization_id=eq.${orgId}` },
        (p) => { const r = p.new as { id?: string; channel?: string }; if (r?.id) schedule(r.id, r.channel); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_threads', filter: `organization_id=eq.${orgId}` },
        (p) => { const r = p.new as { id?: string; channel?: string }; if (r?.id) schedule(r.id, r.channel); })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      if (countTimer.current) clearTimeout(countTimer.current);
    };
  }, [enabled, orgId, schedule]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetchRef.current > VISIBILITY_REFETCH_MS) fetchThreads();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [fetchThreads]);

  const markThreadRead = useCallback((threadId: string) => {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: false } : t)));
  }, []);

  return { threads, total, loading, loadingMore, hasMore, error, refetchThreads: fetchThreads, loadMore, markThreadRead };
}

// Lista de conversas do Comercial (v2): 50 por vez + contador total com os MESMOS filtros.
// Atualização em tempo real: quando uma conversa muda, pergunta ao servidor se ela ainda
// pertence à lista filtrada (filtro thread_ids) — entra, sai ou atualiza sem recarregar tudo.
//
// Cuidados (revisão do PR #220):
// - A conversa ABERTA (pinnedId) nunca some da tela por deixar de bater com o filtro: ela sai
//   da lista, mas continua disponível em `pinnedThread` com os dados atualizados.
// - Uma conversa antiga que muda não entra no fim da lista carregada (isso quebraria o cursor do
//   "Carregar mais"); ela aparece quando a paginação chegar nela.
// - Respostas que chegam depois de o filtro mudar são descartadas (filtro atual num ref).
// - Muitas mudanças de uma vez são consultadas em blocos de até 200 e com espera máxima.
// - O canal de tempo real é um só por org e não é refeito a cada filtro/tecla.
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
  updated_at: string; created_at: string; is_unread: boolean; ai_agent_name?: string | null;
  open_opportunity_id?: string | null; open_stage_id?: string | null; open_stage_name?: string | null; open_opportunity_tags?: OppTag[] | null;
}

function mapRow(r: RowV2, prev?: CommercialChatThread | null): CommercialChatThread {
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
    // A consulta sem filtro (v1) não traz estes campos: mantém os últimos conhecidos.
    ai_agent_name: r.ai_agent_name !== undefined ? r.ai_agent_name : (prev?.ai_agent_name ?? null),
    open_opportunity_id: r.open_opportunity_id !== undefined ? r.open_opportunity_id : (prev?.open_opportunity_id ?? null),
    open_stage_id: r.open_stage_id !== undefined ? r.open_stage_id : (prev?.open_stage_id ?? null),
    open_stage_name: r.open_stage_name !== undefined ? r.open_stage_name : (prev?.open_stage_name ?? null),
    open_opportunity_tags: Array.isArray(r.open_opportunity_tags) ? r.open_opportunity_tags : (prev?.open_opportunity_tags ?? []),
  };
}

const sortKey = (t: { last_message_at: string | null; created_at: string }) => t.last_message_at || t.created_at || '';
const REALTIME_FLUSH_MS = 400;
const REALTIME_MAX_WAIT_MS = 1500;
const COUNT_DEBOUNCE_MS = 1500;
const VISIBILITY_REFETCH_MS = 60_000;
const ID_CHUNK = 200;

export function useCommercialThreads(
  filters: CommercialThreadFilters,
  opts: { limit?: number; enabled?: boolean; pinnedId?: string | null } = {},
) {
  const limit = opts.limit ?? 50;
  const enabled = opts.enabled ?? true;
  const { organization, userProfile } = useOrganization();
  const orgId = organization?.id;
  const userId = userProfile?.id;
  const filtersKey = JSON.stringify(toRpcFilters(filters));

  const [threads, setThreads] = useState<CommercialChatThread[]>([]);
  const [pinnedThread, setPinnedThread] = useState<CommercialChatThread | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef(0);
  const reqSeq = useRef(0);

  // Refs com o estado atual (usados pelos callbacks de tempo real sem refazer o canal).
  const filtersKeyRef = useRef(filtersKey);
  filtersKeyRef.current = filtersKey;
  const pinnedIdRef = useRef<string | null>(opts.pinnedId ?? null);
  pinnedIdRef.current = opts.pinnedId ?? null;
  const threadsRef = useRef<CommercialChatThread[]>([]);
  threadsRef.current = threads;
  const hasMoreRef = useRef(true);
  hasMoreRef.current = hasMore;

  // Guarda a conversa aberta quando ela sai da lista (para o chat não fechar).
  const keepPinned = useCallback((list: CommercialChatThread[], fallback?: CommercialChatThread | null) => {
    const pid = pinnedIdRef.current;
    if (!pid) { setPinnedThread(null); return; }
    if (list.some((t) => t.id === pid)) { setPinnedThread(null); return; }
    setPinnedThread((cur) => (fallback && fallback.id === pid ? fallback : cur && cur.id === pid ? cur : null));
  }, []);

  const fetchCount = useCallback(async () => {
    if (!orgId) return;
    const key = filtersKeyRef.current;
    const { data, error: e } = await supabase.rpc('rpc_count_message_threads_v2' as never, {
      p_organization_id: orgId, p_filters: JSON.parse(key),
    } as never);
    if (key !== filtersKeyRef.current) return;
    if (!e && data !== null && data !== undefined) setTotal(Number(data));
  }, [orgId]);

  const fetchThreads = useCallback(async () => {
    if (!orgId) return;
    const seq = ++reqSeq.current;
    const key = filtersKey;
    try {
      const { data, error: e } = await supabase.rpc('rpc_list_message_threads_v2' as never, {
        p_organization_id: orgId, p_filters: JSON.parse(key), p_limit: limit,
      } as never);
      if (seq !== reqSeq.current) return; // resposta antiga (filtro mudou no meio)
      if (e) {
        if (e.message?.includes('ACCESS_DENIED') || e.code === 'P0002') { setError('ACCESS_DENIED'); setThreads([]); return; }
        throw e;
      }
      const rows = ((data as unknown as RowV2[]) || []).map((r) => mapRow(r));
      const pid = pinnedIdRef.current;
      const prevSelected = threadsRef.current.find((t) => t.id === pid) ?? null;
      setThreads(rows);
      keepPinned(rows, prevSelected);
      // A conversa aberta saiu do filtro: busca os dados atuais dela (sem filtro) para o chat seguir certo.
      if (pid && !rows.some((t) => t.id === pid)) {
        void supabase.rpc('rpc_get_message_threads_by_ids', { p_organization_id: orgId, p_thread_ids: [pid] }).then(({ data: d }) => {
          const row = ((d as unknown as RowV2[]) || [])[0];
          if (row && pinnedIdRef.current === pid) setPinnedThread((cur) => mapRow(row, prevSelected ?? cur));
        });
      }
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
  }, [orgId, filtersKey, limit, fetchCount, keepPinned]);

  const loadMore = useCallback(async () => {
    if (!orgId || !hasMore || loadingMore) return;
    const last = threads[threads.length - 1];
    if (!last) return;
    const key = filtersKeyRef.current;
    const seq = reqSeq.current;
    setLoadingMore(true);
    try {
      const { data, error: e } = await supabase.rpc('rpc_list_message_threads_v2' as never, {
        p_organization_id: orgId, p_filters: JSON.parse(key), p_limit: limit,
        p_cursor_updated_at: last.last_message_at ?? last.created_at, p_cursor_id: last.id,
      } as never);
      if (e) throw e;
      if (key !== filtersKeyRef.current || seq !== reqSeq.current) return; // filtro mudou: descarta
      const rows = ((data as unknown as RowV2[]) || []).map((r) => mapRow(r));
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
  }, [orgId, hasMore, loadingMore, threads, limit]);

  // ── Tempo real: confere no servidor se as conversas alteradas ainda entram no filtro ──
  const pendingIds = useRef<Set<string>>(new Set());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstPendingAt = useRef<number | null>(null);
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (!orgId) return;
    const ids = Array.from(pendingIds.current);
    pendingIds.current.clear();
    firstPendingAt.current = null;
    if (!ids.length) return;
    const key = filtersKeyRef.current;
    const seq = reqSeq.current;

    const fresh: CommercialChatThread[] = [];
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const chunk = ids.slice(i, i + ID_CHUNK);
      const { data, error: e } = await supabase.rpc('rpc_list_message_threads_v2' as never, {
        p_organization_id: orgId, p_filters: { ...JSON.parse(key), thread_ids: chunk }, p_limit: chunk.length,
      } as never);
      if (e) { console.error('Error refreshing threads:', e); return; }
      fresh.push(...((data as unknown as RowV2[]) || []).map((r) => mapRow(r)));
    }
    if (key !== filtersKeyRef.current || seq !== reqSeq.current) return; // filtro mudou: descarta

    const changed = new Set(ids);
    const prev = threadsRef.current;
    const prevById = new Map(prev.map((t) => [t.id, t]));
    const lastLoaded = prev[prev.length - 1];
    const floor = hasMoreRef.current && lastLoaded ? sortKey(lastLoaded) : null;

    const next = prev.filter((t) => !changed.has(t.id));
    for (const t of fresh) {
      // Fora da página carregada (mais antiga que o último item, com mais páginas): não entra agora.
      if (!prevById.has(t.id) && floor && sortKey(t) < floor) continue;
      next.push(t);
    }
    next.sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || b.id.localeCompare(a.id));
    setThreads(next);

    // Conversa aberta que saiu do filtro: busca os dados atuais sem filtro para o chat seguir aberto.
    const pid = pinnedIdRef.current;
    if (pid && changed.has(pid) && !fresh.some((t) => t.id === pid)) {
      const before = prevById.get(pid) ?? null;
      const { data } = await supabase.rpc('rpc_get_message_threads_by_ids', { p_organization_id: orgId, p_thread_ids: [pid] });
      const row = ((data as unknown as RowV2[]) || [])[0];
      if (row && pinnedIdRef.current === pid) setPinnedThread((cur) => mapRow(row, before ?? cur));
    } else {
      keepPinned(next);
    }

    if (countTimer.current) clearTimeout(countTimer.current);
    countTimer.current = setTimeout(() => { fetchCount(); }, COUNT_DEBOUNCE_MS);
  }, [orgId, fetchCount, keepPinned]);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  const schedule = useCallback((id: string, channel?: string) => {
    if (channel && channel !== 'whatsapp') return;
    pendingIds.current.add(id);
    const now = Date.now();
    if (firstPendingAt.current === null) firstPendingAt.current = now;
    if (flushTimer.current) clearTimeout(flushTimer.current);
    // Espera um pouco para juntar eventos, mas nunca mais que REALTIME_MAX_WAIT_MS.
    const wait = now - firstPendingAt.current >= REALTIME_MAX_WAIT_MS ? 0 : REALTIME_FLUSH_MS;
    flushTimer.current = setTimeout(() => { void flushRef.current(); }, wait);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!orgId || !userId) { setThreads([]); setTotal(null); setLoading(false); return; }
    setLoading(true);
    setTotal(null);
    pendingIds.current.clear();
    fetchThreads();
  }, [enabled, orgId, userId, fetchThreads]);

  // Um canal por org: não depende dos filtros (evita derrubar/religar a cada tecla).
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

  // Trocou a conversa aberta: se a nova está na lista, não precisa guardar à parte.
  useEffect(() => { keepPinned(threadsRef.current); }, [opts.pinnedId, keepPinned]);

  const markThreadRead = useCallback((threadId: string) => {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: false } : t)));
    setPinnedThread((cur) => (cur && cur.id === threadId ? { ...cur, unread: false } : cur));
  }, []);

  return { threads, pinnedThread, total, loading, loadingMore, hasMore, error, refetchThreads: fetchThreads, loadMore, markThreadRead };
}

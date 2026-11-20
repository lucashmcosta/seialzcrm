import type { InboxScopedThread } from '@/hooks/inbox/inboxScope';

/** Filtro da lista da Inbox pelo que o agente de IA fez com a conversa. */
export type InboxAgentFilter = 'all' | 'agent' | 'needs_human' | 'urgent' | `area:${string}`;

/** Setor e urgência que o agente marcou na passagem (last_routing_decision). */
export function handoffInfo(t: Pick<InboxScopedThread, 'last_routing_decision'>): { area: string | null; urgent: boolean } {
  const d = (t.last_routing_decision ?? {}) as { action?: unknown; area?: unknown; urgent?: unknown };
  if (d.action !== 'agent_handoff') return { area: null, urgent: false };
  return { area: typeof d.area === 'string' && d.area ? d.area : null, urgent: d.urgent === true };
}

/** O agente está atendendo agora (tem agente e não passou para a equipe). */
export const withAgent = (t: InboxScopedThread) => !!t.agent && !t.ai_agent_released_at && !t.needs_human_attention;

export function matchesAgentFilter(t: InboxScopedThread, f: InboxAgentFilter): boolean {
  if (f === 'all') return true;
  if (f === 'agent') return withAgent(t);
  if (f === 'needs_human') return !!t.needs_human_attention;
  const h = handoffInfo(t);
  if (f === 'urgent') return !!t.needs_human_attention && h.urgent;
  if (f.startsWith('area:')) return !!t.needs_human_attention && h.area === f.slice(5);
  return true;
}

/** Contagem por filtro e os setores que aparecem nas passagens em aberto. */
export function agentFilterCounts(threads: InboxScopedThread[]) {
  const areas = new Map<string, number>();
  let agent = 0, needsHuman = 0, urgent = 0;
  for (const t of threads) {
    if (withAgent(t)) agent++;
    if (t.needs_human_attention) {
      needsHuman++;
      const h = handoffInfo(t);
      if (h.urgent) urgent++;
      if (h.area) areas.set(h.area, (areas.get(h.area) ?? 0) + 1);
    }
  }
  return { all: threads.length, agent, needsHuman, urgent, areas: [...areas.entries()].sort((a, b) => b[1] - a[1]) };
}

/** % passado para a equipe e se está acima da meta. */
export function handoffRate(handled: number, escalated: number, targetPct: number) {
  const pct = handled > 0 ? Math.round((escalated / handled) * 100) : 0;
  return { pct, overTarget: handled > 0 && pct > targetPct };
}

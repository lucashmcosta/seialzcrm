import { describe, expect, test } from 'bun:test';
import { agentFilterCounts, handoffInfo, handoffRate, matchesAgentFilter } from './inboxAgentFilters';
import type { InboxScopedThread } from '@/hooks/inbox/inboxScope';

const base = { id: 'x', contact_id: null, channel: null, status: 'open', priority: null, assigned_user_id: 'u', assigned_at: null,
  first_response_at: null, sla_first_response_target_at: null, sla_resolution_target_at: null, last_message_at: null,
  last_message_content: null, last_message_direction: null, resolved_at: null, primary_endpoint_id: null } as InboxScopedThread;
const agente = { ...base, id: 'a', agent: { id: 'ag', name: 'Atendimento' } };
const passadaFin = { ...base, id: 'b', agent: { id: 'ag', name: 'Atendimento' }, ai_agent_released_at: '2026-11-20T20:00:00Z', needs_human_attention: true,
  last_message_direction: 'inbound', last_routing_decision: { action: 'agent_handoff', area: 'Financeiro', urgent: false } };
const urgenteJur = { ...passadaFin, id: 'c', last_routing_decision: { action: 'agent_handoff', area: 'Jurídico', urgent: true } };
const semAgente = { ...base, id: 'd' };
const respondida = { ...passadaFin, id: 'e', last_message_direction: 'outbound' };

describe('filtros do agente na Inbox', () => {
  test('setor e urgência só valem para passagem do agente', () => {
    expect(handoffInfo(urgenteJur)).toEqual({ area: 'Jurídico', urgent: true });
    expect(handoffInfo({ last_routing_decision: { action: 'inbox_manual_start', area: 'X' } })).toEqual({ area: null, urgent: false });
  });
  test('cada filtro pega o que deve', () => {
    const all = [agente, passadaFin, urgenteJur, semAgente, respondida];
    expect(all.filter((t) => matchesAgentFilter(t, 'agent')).map((t) => t.id)).toEqual(['a']);
    expect(all.filter((t) => matchesAgentFilter(t, 'needs_human')).map((t) => t.id)).toEqual(['b', 'c']);
    expect(all.filter((t) => matchesAgentFilter(t, 'answered')).map((t) => t.id)).toEqual(['e']);
    expect(all.filter((t) => matchesAgentFilter(t, 'urgent')).map((t) => t.id)).toEqual(['c']);
    expect(all.filter((t) => matchesAgentFilter(t, 'area:Financeiro')).map((t) => t.id)).toEqual(['b']);
    expect(agentFilterCounts(all)).toEqual({ all: 5, agent: 1, needsHuman: 2, answered: 1, urgent: 1, areas: [['Financeiro', 1], ['Jurídico', 1]] });
  });
  test('taxa de passagem contra a meta', () => {
    expect(handoffRate(40, 26, 30)).toEqual({ pct: 65, overTarget: true });
    expect(handoffRate(10, 3, 30)).toEqual({ pct: 30, overTarget: false });
    expect(handoffRate(0, 0, 30)).toEqual({ pct: 0, overTarget: false });
  });
});

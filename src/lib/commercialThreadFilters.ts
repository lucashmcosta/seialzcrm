// Filtros da lista de conversas do Comercial (v2).
// O servidor (fn_comercial_threads_filtered) aplica TODOS os filtros, para a lista paginada
// e o contador usarem exatamente a mesma regra.

export type ThreadView = 'open' | 'to_reply' | 'awaiting_client' | 'resolved';
export type ThreadHandler = 'ai' | 'needs_human' | 'none';
export type OppState = 'open' | 'none' | 'won' | 'lost';
export type ThreadOrigin = 'ad' | 'organic';

export interface CommercialThreadFilters {
  view: ThreadView;
  search: string;
  endpointIds: string[];
  assignedUserIds: string[];
  unassigned: boolean;
  handlers: ThreadHandler[];
  oppStates: OppState[];
  stageIds: string[];
  oppTagIds: string[];
  /** Datas no formato YYYY-MM-DD (dia local); o fim é inclusivo. */
  createdFrom: string;
  createdTo: string;
  lastFrom: string;
  lastTo: string;
  origin: ThreadOrigin | '';
  adIds: string[];
  unread: boolean;
}

export const EMPTY_FILTERS: CommercialThreadFilters = {
  view: 'open',
  search: '',
  endpointIds: [],
  assignedUserIds: [],
  unassigned: false,
  handlers: [],
  oppStates: [],
  stageIds: [],
  oppTagIds: [],
  createdFrom: '',
  createdTo: '',
  lastFrom: '',
  lastTo: '',
  origin: '',
  adIds: [],
  unread: false,
};

/** Itens do card que cada pessoa escolhe ver (o "com quem está" é sempre visível). */
export interface CardDisplayPrefs {
  stage: boolean;
  tags: boolean;
  endpoint: boolean;
}
export const DEFAULT_CARD_PREFS: CardDisplayPrefs = { stage: true, tags: false, endpoint: true };

const VIEWS: ThreadView[] = ['open', 'to_reply', 'awaiting_client', 'resolved'];
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T[] => strArr(v).filter((x): x is T => (allowed as readonly string[]).includes(x));
const dateStr = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

/** Lê o que foi salvo (localStorage/servidor) sem confiar no formato. */
export function parseFilters(raw: unknown): CommercialThreadFilters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    view: VIEWS.includes(r.view as ThreadView) ? (r.view as ThreadView) : 'open',
    search: typeof r.search === 'string' ? r.search : '',
    endpointIds: strArr(r.endpointIds),
    assignedUserIds: strArr(r.assignedUserIds),
    unassigned: r.unassigned === true,
    handlers: pick(r.handlers, ['ai', 'needs_human', 'none'] as const),
    oppStates: pick(r.oppStates, ['open', 'none', 'won', 'lost'] as const),
    stageIds: strArr(r.stageIds),
    oppTagIds: strArr(r.oppTagIds),
    createdFrom: dateStr(r.createdFrom),
    createdTo: dateStr(r.createdTo),
    lastFrom: dateStr(r.lastFrom),
    lastTo: dateStr(r.lastTo),
    origin: r.origin === 'ad' || r.origin === 'organic' ? r.origin : '',
    adIds: strArr(r.adIds),
    unread: r.unread === true,
  };
}

export function parseCardPrefs(raw: unknown): CardDisplayPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    stage: typeof r.stage === 'boolean' ? r.stage : DEFAULT_CARD_PREFS.stage,
    tags: typeof r.tags === 'boolean' ? r.tags : DEFAULT_CARD_PREFS.tags,
    endpoint: typeof r.endpoint === 'boolean' ? r.endpoint : DEFAULT_CARD_PREFS.endpoint,
  };
}

/** Dia local (YYYY-MM-DD) → instante ISO do início do dia no fuso do navegador. */
export function startOfLocalDayIso(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}
/** Fim inclusivo: início do dia seguinte (o servidor usa "<"). */
export function endOfLocalDayExclusiveIso(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + 1).toISOString();
}

/** Monta o p_filters do servidor (só manda o que está ativo). */
export function toRpcFilters(f: CommercialThreadFilters, extra?: { threadIds?: string[] }): Record<string, unknown> {
  const out: Record<string, unknown> = { view: f.view };
  const search = f.search.trim();
  if (search) out.search = search;
  if (f.endpointIds.length) out.endpoint_ids = f.endpointIds;
  if (f.assignedUserIds.length) out.assigned_user_ids = f.assignedUserIds;
  if (f.unassigned) out.unassigned = true;
  if (f.handlers.length) out.handlers = f.handlers;
  if (f.oppStates.length) out.opp_states = f.oppStates;
  if (f.stageIds.length) out.stage_ids = f.stageIds;
  if (f.oppTagIds.length) out.opp_tag_ids = f.oppTagIds;
  if (f.createdFrom) out.created_from = startOfLocalDayIso(f.createdFrom);
  if (f.createdTo) out.created_to = endOfLocalDayExclusiveIso(f.createdTo);
  if (f.lastFrom) out.last_from = startOfLocalDayIso(f.lastFrom);
  if (f.lastTo) out.last_to = endOfLocalDayExclusiveIso(f.lastTo);
  if (f.origin) out.origin = f.origin;
  if (f.adIds.length) out.ad_ids = f.adIds;
  if (f.unread) out.unread = true;
  if (extra?.threadIds?.length) out.thread_ids = extra.threadIds;
  return out;
}

/** Quantos filtros do painel estão ativos (a situação/aba e a busca não contam). */
export function countActivePanelFilters(f: CommercialThreadFilters): number {
  let n = 0;
  if (f.endpointIds.length) n++;
  if (f.assignedUserIds.length || f.unassigned) n++;
  if (f.handlers.length) n++;
  if (f.oppStates.length) n++;
  if (f.stageIds.length) n++;
  if (f.oppTagIds.length) n++;
  if (f.createdFrom || f.createdTo) n++;
  if (f.lastFrom || f.lastTo) n++;
  if (f.origin) n++;
  if (f.adIds.length) n++;
  if (f.unread) n++;
  return n;
}

export function clearPanelFilters(f: CommercialThreadFilters): CommercialThreadFilters {
  return { ...EMPTY_FILTERS, view: f.view, search: f.search };
}

/** Texto do contador com singular/plural. */
export function conversationCountLabel(n: number, locale: string): string {
  const pt = locale !== 'en-US';
  const num = n.toLocaleString(pt ? 'pt-BR' : 'en-US');
  if (pt) return `${num} ${n === 1 ? 'conversa' : 'conversas'}`;
  return `${num} ${n === 1 ? 'conversation' : 'conversations'}`;
}

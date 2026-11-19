// Conferência "o que o cliente ouviu x a agenda" (integração Nammux).
// Compara a audiência que está na agenda com a última data e hora que
// escrevemos ao cliente. Aqui: tipos, textos e ordenação — lógica pura,
// testada em nammuxHearingCheck.test.ts. A consulta fica no banco
// (nammux_hearing_notice_check).
import { supabase } from '@/integrations/supabase/client';

export const NAMMUX_HEARING_CHECK_FLAG = 'nammux_hearing_check';
export const NAMMUX_HEARING_CHECK_QUERY_KEY = ['nammux-hearing-check'] as const;

export type HearingCheckKind = 'hora_diferente' | 'data_mudou' | 'sem_aviso';

export type HearingCheckItem = {
  kind: HearingCheckKind;
  opportunityId: string | null;
  contactId: string;
  contactName: string | null;
  cnj: string | null;
  subtype: string | null;
  modality: string | null;
  timezone: string | null;
  /** Dia (AAAA-MM-DD) e hora (HH:MM) que estão na agenda, no fuso da audiência. */
  eventDay: string | null;
  eventHour: string | null;
  /** Dia e hora que escrevemos ao cliente, e quando. */
  toldDay: string | null;
  toldHour: string | null;
  toldAt: string | null;
  lastOutboundAt: string | null;
};

type Row = Record<string, string | null>;

export function mapRow(r: Row): HearingCheckItem {
  return {
    kind: r.kind as HearingCheckKind,
    opportunityId: r.opportunity_id,
    contactId: r.contact_id as string,
    contactName: r.contact_name,
    cnj: r.cnj,
    subtype: r.subtype,
    modality: r.modality,
    timezone: r.timezone,
    eventDay: r.event_day,
    eventHour: r.event_hour,
    toldDay: r.told_day,
    toldHour: r.told_hour,
    toldAt: r.told_at,
    lastOutboundAt: r.last_outbound_at,
  };
}

export async function listHearingCheck(organizationId: string, days = 15): Promise<HearingCheckItem[]> {
  // A função é nova e ainda não está nos tipos gerados.
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string, args: Record<string, unknown>,
  ) => Promise<{ data: Row[] | null; error: { message: string } | null }>)(
    'nammux_hearing_notice_check', { _organization_id: organizationId, _days: days },
  );
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

/** "19/11/2026" a partir de "2026-11-19", sem passar por fuso. */
export function dayBR(day: string | null): string | null {
  const m = day ? /^(\d{4})-(\d{2})-(\d{2})/.exec(day) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/** Dias de calendário entre hoje e o dia informado (0 = hoje). */
export function daysUntil(day: string | null, today: string): number | null {
  const a = day ? /^(\d{4})-(\d{2})-(\d{2})/.exec(day) : null;
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(today);
  if (!a || !b) return null;
  return Math.round((Date.UTC(+a[1], +a[2] - 1, +a[3]) - Date.UTC(+b[1], +b[2] - 1, +b[3])) / 86_400_000);
}

export function whenLabel(day: string | null, today: string): string {
  const n = daysUntil(day, today);
  if (n === null) return '';
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  return n > 1 ? `em ${n} dias` : '';
}

export const KIND_TITLE: Record<HearingCheckKind, string> = {
  hora_diferente: 'Avisamos uma hora diferente da agenda',
  data_mudou: 'Avisamos uma data que foi cancelada ou mudou',
  sem_aviso: 'Não achei aviso da data nas conversas',
};

/** Uma frase dizendo o que está errado e o que fazer. */
export function problemText(i: HearingCheckItem): string {
  const hour = (h: string | null) => (h ? ` às ${h}` : '');
  if (i.kind === 'hora_diferente') {
    return `A agenda diz ${dayBR(i.eventDay)}${hour(i.eventHour)}. A última mensagem ao cliente diz ${i.toldHour}. Avise a hora certa.`;
  }
  if (i.kind === 'data_mudou') {
    const now = i.eventDay
      ? `A audiência agora é em ${dayBR(i.eventDay)}${hour(i.eventHour)}.`
      : 'Essa audiência foi cancelada na agenda.';
    return `O cliente foi avisado de ${dayBR(i.toldDay)}${hour(i.toldHour)}. ${now} Não há mensagem nossa depois disso.`;
  }
  return `Audiência em ${dayBR(i.eventDay)}${hour(i.eventHour)}. Não achei mensagem nossa com essa data. Confirme se o cliente sabe.`;
}

const ORDER: HearingCheckKind[] = ['hora_diferente', 'data_mudou', 'sem_aviso'];

/** Agrupa por tipo, na ordem de gravidade; dentro do grupo, a data mais próxima primeiro. */
export function groupByKind(items: HearingCheckItem[]): { kind: HearingCheckKind; items: HearingCheckItem[] }[] {
  const key = (i: HearingCheckItem) => `${i.kind === 'data_mudou' ? i.toldDay : i.eventDay} ${i.eventHour ?? i.toldHour ?? ''}`;
  return ORDER
    .map((kind) => ({ kind, items: items.filter((i) => i.kind === kind).sort((a, b) => key(a).localeCompare(key(b))) }))
    .filter((g) => g.items.length > 0);
}

/** Quantas pedem ação já: hora errada ou data que mudou, e sem aviso para hoje ou amanhã. */
export function urgentCount(items: HearingCheckItem[], today: string): number {
  return items.filter((i) => {
    if (i.kind !== 'sem_aviso') return true;
    const n = daysUntil(i.eventDay, today);
    return n !== null && n <= 1;
  }).length;
}

/** Hoje em São Paulo, AAAA-MM-DD. */
export function todayInSaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Frases de leitura da Visão Geral (rpc_intelligence_conversations). Só falam quando há base.
import { ratePercent } from '@/lib/intelligenceInsights';

export type SpeedRow = { bucket: number; conversations: number; engaged: number };
export type HourRow = { hour: number; conversations: number; median_minutes: number | null };

export const SPEED_LABELS: Record<number, string> = {
  1: 'Menos de 5 min',
  2: '5 a 30 min',
  3: '30 min a 2 h',
  4: 'Mais de 2 h',
  5: 'Sem resposta',
};

export const MIN_FOR_COMPARE = 20;

/** Compara a resposta mais rápida com a mais lenta, se as duas pontas tiverem conversas suficientes. */
export function speedInsight(rows: SpeedRow[]): string | null {
  const fast = rows.find((r) => r.bucket === 1);
  const slow = rows.find((r) => r.bucket === 4);
  if (!fast || !slow) return null;
  const a = ratePercent(fast.engaged, fast.conversations, MIN_FOR_COMPARE);
  const b = ratePercent(slow.engaged, slow.conversations, MIN_FOR_COMPARE);
  if (a == null || b == null || a - b < 10) return null;
  return `Respondidas em menos de 5 min, ${a}% das conversas seguiram até 5 mensagens do cliente. Acima de 2 h, foram ${b}%.`;
}

/** Faixas de horário contínuas em que a espera mediana passa do limite. */
export function slowHourRanges(rows: HourRow[], limitMinutes = 60): Array<{ from: number; to: number; conversations: number; maxMedian: number }> {
  const slow = rows.filter((r) => (r.median_minutes ?? 0) > limitMinutes).sort((x, y) => x.hour - y.hour);
  const out: Array<{ from: number; to: number; conversations: number; maxMedian: number }> = [];
  for (const r of slow) {
    const last = out[out.length - 1];
    if (last && r.hour === last.to + 1) {
      last.to = r.hour;
      last.conversations += r.conversations;
      last.maxMedian = Math.max(last.maxMedian, r.median_minutes ?? 0);
    } else {
      out.push({ from: r.hour, to: r.hour, conversations: r.conversations, maxMedian: r.median_minutes ?? 0 });
    }
  }
  return out.sort((x, y) => y.conversations - x.conversations);
}

export function formatWait(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = minutes / 60;
  return `${h < 10 ? h.toFixed(1).replace('.', ',').replace(',0', '') : Math.round(h)} h`;
}

export function hourRangeLabel(from: number, to: number): string {
  return `${from}h às ${to + 1 === 24 ? 0 : to + 1}h`;
}

/** Primeira letra maiúscula: os textos chegam normalizados em minúsculas. */
export function sentence(text: string): string {
  const t = text.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

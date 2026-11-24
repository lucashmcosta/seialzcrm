// Quantos processos NOVOS recebem o convite de entrevista hoje.
//
// A ideia: encher a agenda sem lotar. Olha os horários livres dos próximos dias,
// quantos convites ainda estão "no ar" (enviados há pouco, sem resposta) e quanto
// dos convidados costuma marcar. Agenda enchendo → menos convites; agenda vazia →
// mais. Sem banco e sem rede, para testar.

export interface OutreachQuotaInput {
  /** Horários livres de entrevista nos próximos dias (OUTREACH_SLOT_DAYS). */
  freeSlots: number;
  /** Convites enviados nos últimos 3 dias de processos que ainda não marcaram. */
  pending: number;
  /** Processos com 1º convite entre 3 e 14 dias atrás. */
  invited: number;
  /** Desses, quantos marcaram (ou saíram da etapa). */
  converted: number;
}

export const OUTREACH_SLOT_DAYS = 7;
/** Parte da agenda livre que tentamos preencher (folga para remarcações e encaixes). */
export const OUTREACH_FILL = 0.8;
/** Taxa usada enquanto ainda não há convites suficientes para medir. */
export const OUTREACH_DEFAULT_RATE = 0.35;
export const OUTREACH_MIN_SAMPLE = 10;
export const OUTREACH_MAX_PER_DAY = 60;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function outreachRate(invited: number, converted: number): number {
  if (!(invited >= OUTREACH_MIN_SAMPLE)) return OUTREACH_DEFAULT_RATE;
  return clamp(converted / invited, 0.1, 0.8);
}

export function outreachQuota(input: OutreachQuotaInput): { quota: number; rate: number } {
  const rate = outreachRate(input.invited, input.converted);
  const free = Math.max(0, Math.floor(input.freeSlots || 0));
  const need = free * OUTREACH_FILL - Math.max(0, input.pending || 0) * rate;
  if (free <= 0 || need <= 0) return { quota: 0, rate };
  return { quota: clamp(Math.ceil(need / rate), 1, OUTREACH_MAX_PER_DAY), rate };
}

/** Horários que começam dentro dos próximos `days` dias. */
export function countSlotsWithin(slots: Array<{ start_at: string }>, now: Date, days = OUTREACH_SLOT_DAYS): number {
  const end = now.getTime() + days * 86_400_000;
  return slots.filter((s) => {
    const t = new Date(s.start_at).getTime();
    return t > now.getTime() && t <= end;
  }).length;
}

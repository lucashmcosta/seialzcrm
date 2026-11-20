export type PauseChoice = '2h' | '24h' | 'until_resume';

/** "Até reativar" é uma data distante: a coluna é uma data, sem estado extra. */
const FAR_FUTURE_YEAR = 2100;

export function pauseUntil(choice: PauseChoice, now = new Date()): Date {
  if (choice === '2h') return new Date(now.getTime() + 2 * 3_600_000);
  if (choice === '24h') return new Date(now.getTime() + 24 * 3_600_000);
  return new Date(Date.UTC(FAR_FUTURE_YEAR, 0, 1));
}

/** Se o agente está pausado nesta conversa e um rótulo curto ("até 14:30", "até reativar"). */
export function agentPauseState(pausedUntil: string | null | undefined, now = new Date()): { paused: boolean; label: string } {
  if (!pausedUntil) return { paused: false, label: '' };
  const until = new Date(pausedUntil);
  if (isNaN(until.getTime()) || until.getTime() <= now.getTime()) return { paused: false, label: '' };
  if (until.getUTCFullYear() >= FAR_FUTURE_YEAR) return { paused: true, label: 'até reativar' };
  const sameDay = until.toDateString() === now.toDateString();
  const hm = until.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return { paused: true, label: sameDay ? `até ${hm}` : `até ${until.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hm}` };
}

// Helpers for WhatsApp-style date separators in conversation timelines.

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatDateSeparator(date: Date, now: Date = new Date()): string {
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameLocalDay(date, today)) return 'Hoje';
  if (isSameLocalDay(date, yesterday)) return 'Ontem';

  const diffMs = today.getTime() - date.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (diffMs > 0 && diffMs < sevenDaysMs) {
    const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' });
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Returns true when a date separator chip should be rendered before the
 * message at `currentIso`, given the previous message's timestamp
 * (`prevIso` may be null/undefined for the first message).
 */
export function shouldShowDateSeparator(
  currentIso: string,
  prevIso?: string | null,
): boolean {
  if (!prevIso) return true;
  return !isSameLocalDay(new Date(currentIso), new Date(prevIso));
}

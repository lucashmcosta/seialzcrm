/**
 * Format a number of seconds into a compact human-readable duration.
 *  - < 1m  → "Xs"
 *  - < 1h  → "Xm Ys" (omits seconds when 0)
 *  - >= 1h → "Xh Ym" (omits minutes when 0)
 *  - null/NaN/<=0 → "—"
 */
export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  if (s === 0) return '0s';
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return rs ? `${m}m ${rs}s` : `${m}m`;
  }
  const h = Math.floor(s / 3600);
  const rm = Math.floor((s % 3600) / 60);
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

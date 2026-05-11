export const fmtBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(Number(v || 0));

export const fmtInt = (v: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR').format(Math.round(Number(v || 0)));

export const fmtPct = (v: number | null | undefined, digits = 1) =>
  `${(Number(v || 0)).toFixed(digits)}%`;

export const fmtRoas = (v: number | null | undefined) =>
  v == null ? '—' : `${Number(v).toFixed(2)}x`;

export const fmtDateBR = (d: string | Date) => {
  let date: Date;
  if (typeof d === 'string') {
    // Parse YYYY-MM-DD as local date to avoid UTC shift in BRT
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d);
  } else {
    date = d;
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

export const computeDelta = (current: number, previous: number): number | null => {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
};

export const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const previousRange = (from: Date, to: Date): { from: Date; to: Date } => {
  const ms = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - ms);
  return { from: prevFrom, to: prevTo };
};

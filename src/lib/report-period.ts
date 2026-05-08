// Lightweight period utilities — NO UI imports.
// Extracted from ReportFilters so Dashboard/ReportsPage can import the
// computation without pulling react-day-picker, Calendar, Popover or Button
// into the initial render path (which was triggering a production TDZ crash).

export type PeriodPreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'last_7'
  | 'last_30'
  | 'last_90'
  | 'last_365'
  | 'custom';

export interface CustomRange {
  from?: Date;
  to?: Date;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function computeRange(
  preset: PeriodPreset,
  custom?: CustomRange,
): { from: Date; to: Date } {
  const now = new Date();
  const today = startOfDay(now);

  switch (preset) {
    case 'today':
      return { from: today, to: endOfDay(now) };
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: y, to: endOfDay(y) };
    }
    case 'this_week': {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const from = new Date(today);
      from.setDate(from.getDate() - diff);
      return { from, to: endOfDay(now) };
    }
    case 'last_week': {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const thisMonday = new Date(today);
      thisMonday.setDate(thisMonday.getDate() - diff);
      const from = new Date(thisMonday);
      from.setDate(from.getDate() - 7);
      const to = new Date(thisMonday);
      to.setDate(to.getDate() - 1);
      return { from, to: endOfDay(to) };
    }
    case 'this_month': {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from, to: endOfDay(now) };
    }
    case 'last_month': {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from, to: endOfDay(to) };
    }
    case 'last_7':
    case 'last_30':
    case 'last_90':
    case 'last_365': {
      const days =
        preset === 'last_7' ? 7 : preset === 'last_30' ? 30 : preset === 'last_90' ? 90 : 365;
      const from = new Date(today);
      from.setDate(from.getDate() - (days - 1));
      return { from, to: endOfDay(now) };
    }
    case 'custom': {
      if (custom?.from && custom?.to) {
        return { from: startOfDay(custom.from), to: endOfDay(custom.to) };
      }
      if (custom?.from) {
        return { from: startOfDay(custom.from), to: endOfDay(custom.from) };
      }
      return { from: today, to: endOfDay(now) };
    }
  }
}

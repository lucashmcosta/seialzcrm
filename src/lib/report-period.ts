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


/**
 * Explicit previous window, ONLY for calendar presets that are partially elapsed
 * and therefore need the same position inside the previous period:
 *
 *  - this_week  → monday..today  vs  monday..same weekday of the previous week
 *  - this_month → day 1..today   vs  day 1..same day of the previous month
 *
 * Every other preset (including `custom`) returns null so the aggregation RPC
 * keeps its current behaviour (same-duration window immediately before).
 *
 * `toExclusive` is an exclusive upper bound (start of the day after the last
 * day of the previous window), matching the RPC filter `< prev_to`.
 */
export function computeExplicitPreviousRange(
  preset: PeriodPreset,
  current: { from: Date; to: Date },
): { from: Date; toExclusive: Date } | null {
  if (preset === 'this_week') {
    const from = new Date(current.from);
    from.setDate(from.getDate() - 7);
    const toExclusive = startOfDay(current.to);
    toExclusive.setDate(toExclusive.getDate() - 7 + 1);
    return { from: startOfDay(from), toExclusive };
  }

  if (preset === 'this_month') {
    const curFrom = startOfDay(current.from);
    const from = new Date(curFrom.getFullYear(), curFrom.getMonth() - 1, 1);

    const dayOfMonth = startOfDay(current.to).getDate();
    // Last day of the previous month, to clamp e.g. 31/03 → 28/02.
    const lastDayPrevMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
    const lastDay = Math.min(dayOfMonth, lastDayPrevMonth);

    const toExclusive = new Date(from.getFullYear(), from.getMonth(), lastDay);
    toExclusive.setDate(toExclusive.getDate() + 1);
    return { from, toExclusive: startOfDay(toExclusive) };
  }

  return null;
}


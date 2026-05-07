import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a DATE-only string ("YYYY-MM-DD") as UTC, avoiding timezone shifts.
 * Use for Postgres DATE columns.
 */
export function parseDateOnly(value?: string | null): Date | null {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

/**
 * Format a DATE-only string for display without timezone shifts.
 */
export function formatDateOnly(
  value?: string | null,
  locale: string = 'pt-BR',
  options: Intl.DateTimeFormatOptions = {},
): string {
  const d = parseDateOnly(value);
  if (!d) return '';
  return d.toLocaleDateString(locale, { timeZone: 'UTC', ...options });
}

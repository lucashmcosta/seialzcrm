import { useSyncExternalStore } from 'react';
import { enUS, ptBR } from 'date-fns/locale';
import { uiEnglish } from './ui-translations';
import type { AppLocale } from './locale';
let locale: AppLocale = 'pt-BR';
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getUiLocale = () => locale;
export function setUiLocale(next: AppLocale) {
  if (next === locale) return;
  locale = next;
  listeners.forEach(listener => listener());
}
/** Subscribes renderers and formatting helpers to the effective user/org locale. */
export function useUiLocale() { return useSyncExternalStore(subscribe, getUiLocale, getUiLocale); }
export function uiText(source: string, values: Record<string, string | number> = {}): string {
  const template = locale === 'en-US' ? (uiEnglish[source] ?? source) : source;
  return template.replace(/\{(\w+)\}/g, (match, key) => values[key] == null ? match : String(values[key]));
}
export const uiDateLocale = () => locale === 'en-US' ? enUS : ptBR;
export const uiDatePattern = (withTime = false) => locale === 'en-US'
  ? (withTime ? "MMM d, yyyy 'at' h:mm a" : 'MM/dd/yyyy')
  : (withTime ? "dd/MM/yyyy 'às' HH:mm" : 'dd/MM/yyyy');
/** Provider errors may be in any language. Do not expose raw provider prose as product copy. */
export function uiError(error: unknown): string {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  if (locale === 'en-US' && Object.values(uiEnglish).includes(message)) return message;
  if (uiEnglish[message]) return uiText(message);
  return locale === 'en-US' ? 'The operation could not be completed. Please try again.' : 'Não foi possível concluir a operação. Tente novamente.';
}

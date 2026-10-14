import { useEffect } from 'react';
import { useWidgetWorkspace } from './WidgetWorkspaceContext';
import type { WidgetContext } from '../types';

/** A tela publica seu contexto atual; ao desmontar, limpa (widgets contextuais ficam vazios). */
export function useWidgetContextSource(ctx: WidgetContext | null) {
  const set = useWidgetWorkspace()?.setContext;
  const sig = ctx ? JSON.stringify(ctx) : '';
  useEffect(() => {
    if (!set) return;
    set(sig ? (JSON.parse(sig) as WidgetContext) : null);
  }, [set, sig]);
  useEffect(() => () => set?.(null), [set]);
}

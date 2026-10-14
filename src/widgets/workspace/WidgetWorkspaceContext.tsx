import { createContext, useContext } from 'react';
import type { WidgetContext } from '../types';
import type { WorkspaceLayout } from './layout';

export interface WidgetWorkspaceApi {
  organizationId: string;
  layout: WorkspaceLayout;
  /** Widgets ligados globalmente na org (ignora tela). */
  enabledKeys: Set<string>;
  context: WidgetContext | null;
  saveError: boolean;
  open: (key: string) => void;
  minimize: (key: string) => void;
  close: (key: string) => void;
  remove: (key: string) => void;
  focus: (key: string) => void;
  commitGeometry: (key: string, patch: { x?: number; y?: number; w?: number; h?: number }) => void;
  setContext: (ctx: WidgetContext | null) => void;
}

export const WorkspaceCtx = createContext<WidgetWorkspaceApi | null>(null);

/** null quando o Workspace não está montado (mobile, admin, sem org). */
export function useWidgetWorkspace() {
  return useContext(WorkspaceCtx);
}

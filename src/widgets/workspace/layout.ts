/** Modelo puro do layout pessoal do Workspace (sem React, testável). */
export type WindowState = 'open' | 'minimized' | 'closed';
export interface WindowLayout { state: WindowState; x: number; y: number; w: number; h: number; z: number }
export interface WorkspaceLayout { version: 1; windows: Record<string, WindowLayout> }

export const MIN_W = 280;
export const MIN_H = 200;
export const DEFAULT_W = 360;
export const DEFAULT_H = 460;
/** Parte da barra de título que precisa ficar sempre visível. */
export const VISIBLE_GRIP = 48;

export const emptyLayout = (): WorkspaceLayout => ({ version: 1, windows: {} });

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Aceita qualquer JSON do banco e devolve um layout válido (keys desconhecidas são filtradas depois). */
export function parseLayout(raw: unknown): WorkspaceLayout {
  const out = emptyLayout();
  const wins = (raw as any)?.windows;
  if (!wins || typeof wins !== 'object') return out;
  for (const [k, v] of Object.entries(wins as Record<string, any>)) {
    const state: WindowState = v?.state === 'open' || v?.state === 'minimized' ? v.state : 'closed';
    out.windows[k] = { state, x: num(v?.x, 80), y: num(v?.y, 80), w: num(v?.w, DEFAULT_W), h: num(v?.h, DEFAULT_H), z: num(v?.z, 1) };
  }
  return out;
}

export function clampWindow(w: WindowLayout, vw: number, vh: number): WindowLayout {
  const width = Math.min(Math.max(w.w, MIN_W), Math.max(MIN_W, Math.floor(vw * 0.9)));
  const height = Math.min(Math.max(w.h, MIN_H), Math.max(MIN_H, Math.floor(vh * 0.9)));
  const x = Math.min(Math.max(w.x, VISIBLE_GRIP - width), vw - VISIBLE_GRIP);
  const y = Math.min(Math.max(w.y, 0), vh - VISIBLE_GRIP);
  return { ...w, w: width, h: height, x, y };
}

const maxZ = (l: WorkspaceLayout) => Object.values(l.windows).reduce((m, w) => Math.max(m, w.z), 0);

/** Abre (ou restaura) um widget. Reabrir um fechado preserva posição/tamanho. */
export function openWindow(l: WorkspaceLayout, key: string, vw: number, vh: number): WorkspaceLayout {
  const prev = l.windows[key];
  const n = Object.values(l.windows).filter((w) => w.state === 'open').length;
  const base: WindowLayout = prev ?? {
    state: 'open', w: DEFAULT_W, h: DEFAULT_H,
    x: Math.max(16, vw - DEFAULT_W - 32 - n * 28), y: 96 + n * 28, z: 0,
  };
  return { ...l, windows: { ...l.windows, [key]: clampWindow({ ...base, state: 'open', z: maxZ(l) + 1 }, vw, vh) } };
}

export function setState(l: WorkspaceLayout, key: string, state: WindowState): WorkspaceLayout {
  const w = l.windows[key];
  if (!w) return l;
  return { ...l, windows: { ...l.windows, [key]: { ...w, state } } };
}

export function focusWindow(l: WorkspaceLayout, key: string): WorkspaceLayout {
  const w = l.windows[key];
  if (!w) return l;
  const top = maxZ(l);
  if (w.z === top) return l;
  return { ...l, windows: { ...l.windows, [key]: { ...w, z: top + 1 } } };
}

export function moveResize(l: WorkspaceLayout, key: string, patch: Partial<Pick<WindowLayout, 'x' | 'y' | 'w' | 'h'>>, vw: number, vh: number): WorkspaceLayout {
  const w = l.windows[key];
  if (!w) return l;
  return { ...l, windows: { ...l.windows, [key]: clampWindow({ ...w, ...patch }, vw, vh) } };
}

export function removeWindow(l: WorkspaceLayout, key: string): WorkspaceLayout {
  if (!l.windows[key]) return l;
  const { [key]: _drop, ...rest } = l.windows;
  return { ...l, windows: rest };
}

export function clampAll(l: WorkspaceLayout, vw: number, vh: number): WorkspaceLayout {
  let changed = false;
  const windows: Record<string, WindowLayout> = {};
  for (const [k, w] of Object.entries(l.windows)) {
    const c = clampWindow(w, vw, vh);
    if (c.x !== w.x || c.y !== w.y || c.w !== w.w || c.h !== w.h) changed = true;
    windows[k] = c;
  }
  return changed ? { ...l, windows } : l;
}

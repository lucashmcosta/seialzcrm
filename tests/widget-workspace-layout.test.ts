import { describe, expect, it } from 'vitest';
import { clampWindow, emptyLayout, focusWindow, moveResize, openWindow, parseLayout, removeWindow, setState, MIN_W, VISIBLE_GRIP } from '../src/widgets/workspace/layout';

const VW = 1440, VH = 900;

describe('widget workspace layout', () => {
  it('abre, fecha preservando geometria e reabre no mesmo lugar', () => {
    let l = openWindow(emptyLayout(), 'a', VW, VH);
    l = moveResize(l, 'a', { x: 200, y: 150, w: 400, h: 300 }, VW, VH);
    l = setState(l, 'a', 'closed');
    expect(l.windows.a.state).toBe('closed');
    l = openWindow(l, 'a', VW, VH);
    expect(l.windows.a).toMatchObject({ state: 'open', x: 200, y: 150, w: 400, h: 300 });
  });
  it('minimizar mantém entrada; remover apaga', () => {
    let l = setState(openWindow(emptyLayout(), 'a', VW, VH), 'a', 'minimized');
    expect(l.windows.a.state).toBe('minimized');
    l = removeWindow(l, 'a');
    expect(l.windows.a).toBeUndefined();
  });
  it('uma instância por widget e foco traz para frente', () => {
    let l = openWindow(openWindow(emptyLayout(), 'a', VW, VH), 'b', VW, VH);
    l = openWindow(l, 'a', VW, VH);
    expect(Object.keys(l.windows)).toEqual(['a', 'b']);
    l = focusWindow(l, 'b');
    expect(l.windows.b.z).toBeGreaterThan(l.windows.a.z);
  });
  it('nunca deixa a janela inacessível', () => {
    const c = clampWindow({ state: 'open', x: 5000, y: -300, w: 10, h: 10, z: 1 }, VW, VH);
    expect(c.w).toBe(MIN_W);
    expect(c.x).toBeLessThanOrEqual(VW - VISIBLE_GRIP);
    expect(c.y).toBe(0);
  });
  it('parse tolera lixo do banco', () => {
    expect(parseLayout(null).windows).toEqual({});
    expect(parseLayout({ windows: { a: { state: 'x' } } }).windows.a.state).toBe('closed');
  });
});

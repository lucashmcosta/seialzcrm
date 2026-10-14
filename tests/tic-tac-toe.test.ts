import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computerMove, isDraw, winnerOf, type Board } from '../src/widgets/tic-tac-toe/ticTacToe';
import * as store from '../src/widgets/tic-tac-toe/store';

const B = (s: string): Board => s.split('').map((c) => (c === 'X' || c === 'O' ? c : null));

describe('regras', () => {
  it('detecta linha, coluna e diagonal', () => {
    expect(winnerOf(B('XXX......'))?.winner).toBe('X');
    expect(winnerOf(B('O..O..O..'))?.winner).toBe('O');
    expect(winnerOf(B('X...X...X'))?.line).toEqual([0, 4, 8]);
  });
  it('detecta empate', () => { expect(isDraw(B('XOXXOOOXX'))).toBe(true); });
  it('computador ganha quando pode', () => { expect(computerMove(B('OO.XX....'))).toBe(2); });
  it('computador bloqueia', () => { expect(computerMove(B('XX..O....'))).toBe(2); });
  it('nunca joga em casa ocupada', () => {
    const b = B('XOXOX.O..'); const m = computerMove(b); expect(b[m]).toBeNull();
  });
});

describe('store', () => {
  beforeEach(() => { vi.useFakeTimers(); store.__resetForTests(); });
  afterEach(() => vi.useRealTimers());

  it('computador responde após a jogada', () => {
    store.bind('u1:o1'); store.play('u1:o1', 0);
    vi.advanceTimersByTime(400);
    expect(store.getSnapshot('u1:o1')!.board.filter(Boolean).length).toBe(2);
  });
  it('reiniciar invalida jogada atrasada', () => {
    store.bind('u1:o1'); store.play('u1:o1', 0); store.reset('u1:o1');
    vi.advanceTimersByTime(400);
    expect(store.getSnapshot('u1:o1')!.board.every((c) => c === null)).toBe(true);
  });
  it('troca de usuário/org isola e descarta jogada pendente', () => {
    store.bind('u1:o1'); store.play('u1:o1', 0);
    store.bind('u2:o1');
    vi.advanceTimersByTime(400);
    expect(store.getSnapshot('u1:o1')).toBeNull();
    expect(store.getSnapshot('u2:o1')!.board.every((c) => c === null)).toBe(true);
    store.bind('u1:o1');
    expect(store.getSnapshot('u1:o1')!.board.every((c) => c === null)).toBe(true);
  });
  it('logout (chave nula) apaga a partida', () => {
    store.bind('u1:o1'); store.play('u1:o1', 4); store.bind(null);
    vi.advanceTimersByTime(400);
    expect(store.getSnapshot('u1:o1')).toBeNull();
  });
});

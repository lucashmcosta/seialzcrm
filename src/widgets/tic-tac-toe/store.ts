import { computerMove, emptyBoard, isDraw, winnerOf, type Board } from './ticTacToe';

/**
 * Partida em memória, isolada por `userId:organizationId`. Só a chave atual é mantida:
 * acessar outra chave (troca de usuário/org/logout+login) descarta a anterior e cancela a jogada pendente.
 * Cada partida tem um `gameId`; a jogada atrasada do computador só aplica se chave e gameId ainda batem.
 */
export interface Game { gameId: number; board: Board; thinking: boolean }

const COMPUTER_DELAY_MS = 350;
let currentKey: string | null = null;
let game: Game = { gameId: 0, board: emptyBoard(), thinking: false };
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const cancelTimer = () => { if (timer) clearTimeout(timer); timer = null; };

function fresh(): Game { cancelTimer(); return { gameId: ++seq, board: emptyBoard(), thinking: false }; }

/** Garante a chave ativa; chave diferente zera tudo (nada da sessão anterior fica visível). */
export function bind(key: string | null, notify = true) {
  if (key === currentKey) return;
  currentKey = key;
  game = fresh();
  if (notify) emit();
}

/** Logout descarta a partida mesmo com a janela fora da tela. */
export function watchSignOut(onAuth: (cb: (event: string) => void) => void) {
  onAuth((event) => { if (event === 'SIGNED_OUT') bind(null); });
}

export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getSnapshot = (key: string | null): Game | null => (key && key === currentKey ? game : null);

export function reset(key: string) {
  if (key !== currentKey) return;
  game = fresh();
  emit();
}

export function play(key: string, i: number) {
  if (key !== currentKey || game.thinking || game.board[i] || winnerOf(game.board) || isDraw(game.board)) return;
  const board = game.board.slice(); board[i] = 'X';
  const done = !!winnerOf(board) || isDraw(board);
  game = { ...game, board, thinking: !done };
  emit();
  if (done) return;
  const { gameId } = game;
  cancelTimer();
  timer = setTimeout(() => {
    timer = null;
    if (key !== currentKey || game.gameId !== gameId) return; // resposta atrasada de outra partida/sessão
    const b = game.board.slice();
    const m = computerMove(b);
    if (m >= 0) b[m] = 'O';
    game = { ...game, board: b, thinking: false };
    emit();
  }, COMPUTER_DELAY_MS);
}

/** Uso em testes. */
export const __resetForTests = () => { currentKey = null; game = fresh(); listeners.clear(); };

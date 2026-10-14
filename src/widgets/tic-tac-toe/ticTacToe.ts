export type Cell = 'X' | 'O' | null;
export type Board = Cell[];

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
] as const;

export const emptyBoard = (): Board => Array(9).fill(null);

export function winnerOf(b: Board): { winner: 'X' | 'O'; line: readonly number[] } | null {
  for (const l of LINES) {
    const [a, c, d] = l;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { winner: b[a] as 'X' | 'O', line: l };
  }
  return null;
}

export const isDraw = (b: Board) => !winnerOf(b) && b.every(Boolean);

function findLineMove(b: Board, p: 'X' | 'O'): number | null {
  for (const l of LINES) {
    const vals = l.map((i) => b[i]);
    if (vals.filter((v) => v === p).length === 2 && vals.includes(null)) return l[vals.indexOf(null)];
  }
  return null;
}

/** Ganhar > bloquear > centro > canto > qualquer livre. -1 se não houver casa. */
export function computerMove(b: Board, rand: () => number = Math.random): number {
  const win = findLineMove(b, 'O'); if (win !== null) return win;
  const block = findLineMove(b, 'X'); if (block !== null) return block;
  if (!b[4]) return 4;
  const pick = (idx: number[]) => { const f = idx.filter((i) => !b[i]); return f.length ? f[Math.floor(rand() * f.length)] : -1; };
  const corner = pick([0, 2, 6, 8]); if (corner !== -1) return corner;
  return pick([1, 3, 5, 7]);
}

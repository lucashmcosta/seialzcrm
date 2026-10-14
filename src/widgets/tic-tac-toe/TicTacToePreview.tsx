const CELLS = ['X', 'O', '', '', 'X', 'O', '', '', 'X'];
const LINE = [0, 4, 8];

/** Prévia estática (galeria). Não importa o widget funcional. */
export function TicTacToePreview() {
  return (
    <div className="grid w-[96px] grid-cols-3 gap-1">
      {CELLS.map((c, i) => (
        <div key={i} className={`flex aspect-square items-center justify-center rounded-[6px] border font-data text-sm ${
          LINE.includes(i) ? 'border-primary bg-[hsl(var(--sz-green-dim))] text-primary' : 'border-border bg-card text-foreground'}`}>
          {c}
        </div>
      ))}
    </div>
  );
}

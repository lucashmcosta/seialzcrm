/** Prévia estática para a galeria /widgets (não chama o servidor nem carrega o assistente). */
const FAIXAS = [['prata', 'Prata'], ['ouro', 'Ouro'], ['titanio', 'Titânio'], ['diamante', 'Diamante']] as const;

export function ProcessClassificationPreview() {
  return (
    <div className="flex items-center justify-center gap-3 py-3">
      {FAIXAS.map(([k, nome]) => (
        <div key={k} className="flex flex-col items-center gap-1">
          <span className="h-7 w-7 rounded-full border-2" style={{ borderColor: `hsl(var(--band-${k}))`, background: `hsl(var(--band-${k}) / 0.15)` }} />
          <span className="text-[10px] text-muted-foreground">{nome}</span>
        </div>
      ))}
    </div>
  );
}

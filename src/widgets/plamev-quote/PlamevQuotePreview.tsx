/** Prévia estática (galeria). Não importa o widget funcional nem chama a Plamev. */
export function PlamevQuotePreview() {
  return (
    <div className="w-[150px] space-y-1.5 rounded-[6px] border border-border bg-card p-2.5 shadow-sm">
      <div className="h-2 w-16 rounded-[6px] bg-muted" />
      <div className="h-5 rounded-[6px] border border-border bg-background" />
      <div className="h-5 rounded-[6px] border border-border bg-background" />
      <div className="flex items-baseline justify-between pt-1">
        <span className="text-[10px] text-muted-foreground">/mês</span>
        <span className="font-data text-sm text-primary">R$ 169,99</span>
      </div>
    </div>
  );
}

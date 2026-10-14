/** Prévia estática (galeria). Não importa o widget funcional. */
export function OvertimePreview() {
  return (
    <div className="w-[150px] space-y-1.5 rounded-[6px] border border-border bg-card p-2.5 shadow-sm">
      <div className="h-2 w-16 rounded-[6px] bg-muted" />
      <div className="h-5 rounded-[6px] border border-border bg-background" />
      <div className="h-5 rounded-[6px] border border-border bg-background" />
      <div className="pt-1 text-right font-data text-sm text-primary">R$ 1.234,56</div>
    </div>
  );
}

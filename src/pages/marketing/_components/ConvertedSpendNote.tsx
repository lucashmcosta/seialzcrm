import { uiText, useUiLocale } from '@/lib/ui-locale';
import { fmtOriginal, type OriginalSpend } from '../_lib/originalSpend';

// A conta de anúncio é em outra moeda: deixa claro que o valor foi convertido e mostra o que bate com a Meta.
export function ConvertedSpendNote({ original }: { original: OriginalSpend | null | undefined }) {
  useUiLocale();
  if (!original) return null;
  return (
    <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      {uiText('Conta de anúncio em {0}: valores convertidos para reais pela cotação oficial (PTAX) de cada dia. Total na conta: {1}.', {
        0: original.currency,
        1: fmtOriginal(original.totalCents, original.currency),
      })}
    </p>
  );
}

// Campo de dinheiro com máscara: símbolo da moeda dentro do campo e separadores entrando enquanto
// a pessoa digita (pt-BR: 1.900,50 · en-US: 1,900.50). Texto livre, sem setinhas de número.
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { currencySymbol, formatMoneyInput, maskMoneyInput, parseMoneyInput } from '@/lib/moneyMask';

export function MoneyInput({ id, value, currency, locale, disabled, onCommit, className }: {
  id?: string;
  value: number | null | undefined;
  currency: string;
  locale: string;
  disabled?: boolean;
  /** Chamado ao sair do campo (ou Enter) com o número final (null = vazio). */
  onCommit: (value: number | null) => void;
  className?: string;
}) {
  // Zero conta como "sem valor": campo vazio, só com o exemplo 0,00 em cinza.
  const display = (v: number | null | undefined) => (v ? formatMoneyInput(v, locale) : '');
  const [text, setText] = useState(display(value));
  useEffect(() => { setText(display(value)); }, [value, locale]); // eslint-disable-line react-hooks/exhaustive-deps
  const symbol = currencySymbol(currency, locale);

  const commit = () => {
    const n = parseMoneyInput(text, locale);
    setText(display(n)); // completa os centavos (1.900,5 → 1.900,50); zero volta a ficar vazio
    onCommit(n);
  };

  return (
    <div className={cn('relative', className)}>
      {/* z-10: o Input do sistema tem camada animada com fundo próprio, que cobria o símbolo. */}
      <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-muted-foreground">{symbol}</span>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        placeholder={locale === 'en-US' ? '0.00' : '0,00'}
        autoComplete="off"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(maskMoneyInput(e.target.value, locale))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{ paddingLeft: `${Math.max(2.25, symbol.length * 0.6 + 1.4)}rem` }}
      />
    </div>
  );
}

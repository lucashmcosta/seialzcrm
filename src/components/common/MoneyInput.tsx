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
  const [text, setText] = useState(formatMoneyInput(value ?? null, locale));
  useEffect(() => { setText(formatMoneyInput(value ?? null, locale)); }, [value, locale]);
  const symbol = currencySymbol(currency, locale);

  const commit = () => {
    const n = parseMoneyInput(text, locale);
    setText(formatMoneyInput(n, locale)); // completa os centavos (1.900,5 → 1.900,50)
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
        placeholder={formatMoneyInput(0, locale) === '0' ? (locale === 'en-US' ? '0.00' : '0,00') : undefined}
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

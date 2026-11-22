// Campo compacto para usar DENTRO de uma linha (ao lado de selects e textos). O <Input> padrão vem
// embrulhado numa caixa de largura total e quebra a linha; este não.
import * as React from 'react';
import { cn } from '@/lib/utils';

export const InlineInput = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-8 shrink-0 rounded-lg border border-input bg-background px-2 text-sm tabular-nums ring-offset-background',
      'placeholder:text-muted-foreground hover:border-primary/30',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
InlineInput.displayName = 'InlineInput';

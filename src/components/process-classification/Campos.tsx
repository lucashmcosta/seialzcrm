import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { numeroBR } from './rascunho';

type Opcao = readonly [string, string];

/** Rótulo + dica (texto auxiliar das perguntas do motor). */
export function Rotulo({ id, rotulo, dica }: { id?: string; rotulo: string; dica?: string }) {
  return (
    <Label htmlFor={id} className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium leading-snug">
      {rotulo}
      {dica && <span className="text-xs font-normal text-muted-foreground">{dica}</span>}
    </Label>
  );
}

const longas = (opcoes: readonly Opcao[]) => opcoes.some(([, r]) => r.length > 28);

/** Escolha única em chips (chip e select do motor). Opções longas viram uma lista vertical. */
export function Escolha({ valor, opcoes, onChange, rotulo }: {
  valor: string | undefined; opcoes: readonly Opcao[]; onChange: (v: string) => void; rotulo: string;
}) {
  const vertical = longas(opcoes);
  return (
    <ToggleGroup type="single" value={valor ?? ''} aria-label={rotulo}
      onValueChange={(v) => { if (v) onChange(v); }}
      className={cn('flex flex-wrap justify-start gap-2', vertical && 'flex-col items-stretch')}>
      {opcoes.map(([v, r]) => (
        <ToggleGroupItem key={v} value={v} variant="outline"
          className={cn('h-auto min-h-9 whitespace-normal rounded-full px-3 py-1.5 text-sm data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
            vertical && 'justify-start rounded-md text-left')}>
          {r}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Marcação múltipla em chips. */
export function Multipla({ valor, opcoes, onChange, rotulo }: {
  valor: string[]; opcoes: readonly Opcao[]; onChange: (v: string[]) => void; rotulo: string;
}) {
  const vertical = longas(opcoes);
  return (
    <ToggleGroup type="multiple" value={valor} onValueChange={onChange} aria-label={rotulo}
      className={cn('flex flex-wrap justify-start gap-2', vertical && 'flex-col items-stretch')}>
      {opcoes.map(([v, r]) => (
        <ToggleGroupItem key={v} value={v} variant="outline"
          className={cn('h-auto min-h-9 whitespace-normal rounded-full px-3 py-1.5 text-sm data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
            vertical && 'justify-start rounded-md text-left')}>
          {r}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * Número no formato brasileiro. Mostra o que foi digitado; ao sair do campo vazio, volta ao valor marcado.
 * `onChange(undefined)` = sem resposta (vale o valor marcado).
 */
export function Numero({ id, valor, onChange, prefixo, erro }: {
  id: string; valor: number | string | undefined; onChange: (v: number | string | undefined) => void; prefixo?: string; erro?: string;
}) {
  const n = valor === undefined ? undefined : numeroBR(String(valor));
  // fora do foco, mostra no formato brasileiro (3.500,5); texto inválido fica como foi digitado
  const fora = valor === undefined ? '' : n !== undefined ? n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : String(valor);
  const [texto, setTexto] = useState(fora);
  const [focado, setFocado] = useState(false);
  useEffect(() => { if (!focado) setTexto(fora); }, [fora, focado]);
  return (
    <div className="space-y-1">
      <div className="relative">
        {prefixo && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefixo}</span>}
        <Input id={id} inputMode="decimal" autoComplete="off" value={texto} aria-invalid={!!erro}
          className={cn(prefixo && 'pl-9', erro && 'border-destructive')}
          onFocus={() => setFocado(true)}
          onBlur={() => setFocado(false)}
          onChange={(e) => {
            const t = e.target.value;
            setTexto(t);
            // número válido vai como número; texto inválido vai como está (a tela mostra o erro e trava o Próximo)
            onChange(t.trim() === '' ? undefined : numeroBR(t) ?? t);
          }} />
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}

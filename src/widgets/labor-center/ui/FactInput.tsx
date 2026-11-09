import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import type { FactDef } from '../calc';

export type RawValue = string | boolean | undefined;

/** Campo de um fato: valor + "não sabe". Mostra a pergunta e a premissa usada se ficar vazio. */
export function FactInput({ def, value, unknown, premise, onChange, onUnknown, showQuestion = true }: {
  def: FactDef;
  value: RawValue;
  unknown: boolean;
  /** Texto da premissa, quando existe. */
  premise?: string;
  onChange: (v: RawValue) => void;
  onUnknown: (v: boolean) => void;
  showQuestion?: boolean;
}) {
  const id = `lc-${def.key}`;
  const empty = value === undefined || value === '';
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium leading-tight">{def.label}</label>
        <button type="button" onClick={() => onUnknown(!unknown)}
          className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] leading-none',
            unknown ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'border-border text-muted-foreground hover:text-foreground')}>
          {unknown ? 'Não sabe ✓' : 'Não sabe'}
        </button>
      </div>
      {showQuestion && <p className="text-[11px] italic leading-snug text-muted-foreground">“{def.question}”</p>}
      {!unknown && <Control id={id} def={def} value={value} onChange={onChange} />}
      {(unknown || empty) && premise && (
        <p className="text-[11px] text-muted-foreground">Enquanto isso, considera: <span className="font-medium">{premise}</span></p>
      )}
      {unknown && !premise && <p className="text-[11px] text-amber-700 dark:text-amber-400">Sem essa informação o pedido fica pendente. Peça documento.</p>}
    </div>
  );
}

function Control({ id, def, value, onChange }: { id: string; def: FactDef; value: RawValue; onChange: (v: RawValue) => void }) {
  if (def.kind === 'bool')
    return (
      <div className="flex gap-1.5" id={id}>
        {([true, false] as const).map((b) => (
          <Button key={String(b)} type="button" size="sm" variant={value === b ? 'default' : 'outline'} className="h-7 flex-1 text-xs"
            onClick={() => onChange(value === b ? undefined : b)}>
            {b ? 'Sim' : 'Não'}
          </Button>
        ))}
      </div>
    );
  if (def.kind === 'enum')
    return (
      <NativeSelect id={id} className="h-9 py-1.5 text-xs" value={typeof value === 'string' ? value : ''}
        options={[{ value: '', label: '— escolher —' }, ...(def.options ?? [])]}
        onChange={(e) => onChange(e.target.value || undefined)} />
    );
  const type = def.kind === 'date' ? 'date' : def.kind === 'time' ? 'time' : undefined;
  const placeholder = def.kind === 'money' ? '0,00' : def.kind === 'text' ? '' : undefined;
  return (
    <Input id={id} type={type} inputMode={type || def.kind === 'text' ? undefined : 'decimal'} placeholder={placeholder}
      value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
  );
}

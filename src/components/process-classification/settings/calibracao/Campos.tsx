import { Numero } from '../../Campos';
import { cn } from '@/lib/utils';
import { ler, mudou, type Calibracao, type Caminho } from './editor';

const fmt = (v: unknown, sufixo?: string) => (typeof v === 'number' ? `${v.toLocaleString('pt-BR')}${sufixo ?? ''}` : '—');

/**
 * Um número da calibração: rótulo, o "porquê" do catálogo e o campo. Destaca o que mudou em relação à publicada
 * (mostra o valor antigo). Valor inválido não é aplicado (o servidor também confere antes de publicar).
 */
export function CampoCalibracao({ rotulo, sub, caminho, atual, publicada, onChange, sufixo, prefixo, disabled }: {
  rotulo: string; sub?: string; caminho: Caminho; atual: Calibracao; publicada: Calibracao | null;
  onChange: (caminho: Caminho, valor: number) => void; sufixo?: string; prefixo?: string; disabled?: boolean;
}) {
  const v = ler(atual, caminho) as number | undefined;
  const alterado = mudou(publicada, atual, caminho);
  const id = `cal-${caminho.join('-')}`;
  return (
    <div className={cn('grid gap-2 rounded-md p-2 sm:grid-cols-[1fr_140px] sm:items-center', alterado && 'bg-warning/10 ring-1 ring-warning/40')}>
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{rotulo}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
        {alterado && <span className="block text-xs text-warning-foreground dark:text-warning">antes: {fmt(ler(publicada, caminho), sufixo)}</span>}
      </label>
      <div className="flex items-center gap-1.5">
        {disabled
          ? <span className="text-sm tabular-nums">{prefixo}{fmt(v)}{sufixo}</span>
          : <Numero id={id} valor={v} prefixo={prefixo} onChange={(n) => { if (typeof n === 'number') onChange(caminho, n); }} />}
        {sufixo && !disabled && <span className="text-xs text-muted-foreground">{sufixo}</span>}
      </div>
    </div>
  );
}

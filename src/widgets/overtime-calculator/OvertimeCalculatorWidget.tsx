import { useMemo, useState } from 'react';
import { Copy } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import type { WidgetContext } from '../types';
import { brl, calcOvertime } from './overtime';

const parse = (v: string) => Number(v.replace(/\./g, '').replace(',', '.'));

export function OvertimeCalculatorWidget(_: { context: WidgetContext }) {
  const [salary, setSalary] = useState('');
  const [divisor, setDivisor] = useState('220');
  const [hours, setHours] = useState('');
  const [preset, setPreset] = useState<'50' | '100' | 'custom'>('50');
  const [custom, setCustom] = useState('');

  const percent = preset === 'custom' ? parse(custom) : Number(preset);
  const result = useMemo(
    () => calcOvertime({ salary: parse(salary), divisor: parse(divisor), hours: parse(hours), percent }),
    [salary, divisor, hours, percent],
  );

  const memory = result
    ? [
        `Hora normal = ${brl(parse(salary))} ÷ ${parse(divisor)} = ${brl(result.hourly)}`,
        `Hora extra = ${brl(result.hourly)} × (1 + ${percent}%) = ${brl(result.overtimeHourly)}`,
        `Total estimado = ${brl(result.overtimeHourly)} × ${parse(hours)} h = ${brl(result.total)}`,
      ]
    : [];

  const copy = async () => {
    const text = ['Cálculo estimado de horas extras', ...memory,
      'Estimativa simples, sem DSR, 13º, férias e FGTS.'].join('\n');
    await navigator.clipboard.writeText(text);
    toast({ title: 'Resultado copiado' });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="ot-salary">Salário mensal (R$)</Label>
          <Input id="ot-salary" inputMode="decimal" placeholder="3.000,00" value={salary} onChange={(e) => setSalary(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ot-divisor">Divisor de horas</Label>
          <Input id="ot-divisor" inputMode="decimal" value={divisor} onChange={(e) => setDivisor(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ot-hours">Horas extras</Label>
          <Input id="ot-hours" inputMode="decimal" placeholder="10" value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Adicional</Label>
        <div className="flex gap-2">
          {(['50', '100', 'custom'] as const).map((p) => (
            <Button key={p} type="button" size="sm" variant={preset === p ? 'default' : 'outline'} onClick={() => setPreset(p)}>
              {p === 'custom' ? 'Personalizado' : `${p}%`}
            </Button>
          ))}
        </div>
        {preset === 'custom' && (
          <Input aria-label="Percentual personalizado" inputMode="decimal" placeholder="Ex.: 70" value={custom} onChange={(e) => setCustom(e.target.value)} />
        )}
      </div>

      <div className="rounded-[6px] border border-border bg-muted/40 p-3 space-y-2">
        <Row label="Hora normal" value={result ? brl(result.hourly) : '—'} />
        <Row label="Hora extra" value={result ? brl(result.overtimeHourly) : '—'} />
        <Row label="Total estimado" value={result ? brl(result.total) : '—'} strong />
      </div>

      {result && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Memória de cálculo</div>
          <pre className="whitespace-pre-wrap text-xs font-mono text-foreground">{memory.join('\n')}</pre>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">Estimativa simples. Não inclui DSR, 13º, férias + 1/3 nem FGTS.</p>

      <Button type="button" variant="outline" className="w-full gap-2" disabled={!result} onClick={copy}>
        <Copy size={14} /> Copiar resultado
      </Button>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${strong ? 'font-semibold text-foreground' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}

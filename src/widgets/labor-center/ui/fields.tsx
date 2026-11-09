import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { brl, type Line } from '../calc';

export function Field({ id, label, hint, className, value, onChange, type, placeholder }: {
  id: string; label: string; hint?: ReactNode; className?: string;
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} type={type} inputMode={type ? undefined : 'decimal'} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Check({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-xs">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      {label}
    </label>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('shrink-0 font-mono text-foreground', strong && 'font-semibold')}>{value}</span>
    </div>
  );
}

export function LinesCard({ lines, total, totalLabel = 'Subtotal' }: { lines: Line[]; total: number; totalLabel?: string }) {
  return (
    <div className="space-y-1.5 rounded-[6px] border border-border bg-muted/40 p-3">
      {lines.map((l) => <Row key={l.label} label={l.label} value={brl(l.value)} />)}
      <div className="border-t border-border pt-1.5">
        <Row label={totalLabel} value={brl(total)} strong />
      </div>
    </div>
  );
}

export type Tone = 'muted' | 'warn' | 'danger' | 'ok';

export function Notice({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div className={cn('rounded-[6px] px-2.5 py-2 text-[11px] leading-snug',
      tone === 'muted' && 'bg-muted/60 text-muted-foreground',
      tone === 'warn' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
      tone === 'danger' && 'bg-destructive/10 text-destructive',
      tone === 'ok' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    )}>{children}</div>
  );
}

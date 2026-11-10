// Editor de mensagem interativa (botões, lista ou botão de link) com prévia.
// As regras vêm de _shared/whatsapp-interactive.ts, as mesmas que o servidor aplica.
import { Plus, Trash } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  INTERACTIVE_LIMITS as L,
  type InteractivePayload,
} from '../../../supabase/functions/_shared/whatsapp-interactive';
import { InteractiveMessageCard } from './InteractiveMessageCard';

export type InteractiveKind = InteractivePayload['kind'];

export function emptyInteractive(kind: InteractiveKind = 'buttons'): InteractivePayload {
  if (kind === 'list') return { kind, body: '', buttonText: 'Ver opções', sections: [{ rows: [{ id: '', title: '' }, { id: '', title: '' }] }] };
  if (kind === 'cta_url') return { kind, body: '', displayText: '', url: '' };
  return { kind: 'buttons', body: '', buttons: [{ id: '', title: '' }, { id: '', title: '' }] };
}

/** Troca o tipo aproveitando o texto e as opções já digitados. */
export function switchKind(p: InteractivePayload, kind: InteractiveKind): InteractivePayload {
  if (p.kind === kind) return p;
  const base = { body: p.body, header: p.header, footer: p.footer };
  const titles = p.kind === 'buttons' ? p.buttons.map((b) => b.title) : p.kind === 'list' ? p.sections.flatMap((s) => s.rows.map((r) => r.title)) : [];
  if (kind === 'buttons') {
    const t = (titles.length ? titles : ['', '']).slice(0, L.buttonsMax);
    return { ...base, kind, buttons: t.map((title) => ({ id: '', title })) };
  }
  if (kind === 'list') {
    const t = titles.length ? titles : ['', ''];
    return { ...base, kind, buttonText: 'Ver opções', sections: [{ rows: t.map((title) => ({ id: '', title })) }] };
  }
  return { ...base, kind, displayText: '', url: '' };
}

function Counter({ value, max }: { value: string | undefined; max: number }) {
  const n = [...(value ?? '')].length;
  return <span className={cn('text-[11px] tabular-nums', n > max ? 'text-destructive' : 'text-muted-foreground')}>{n}/{max}</span>;
}

const KINDS: Array<{ value: InteractiveKind; label: string; hint: string }> = [
  { value: 'buttons', label: 'Botões', hint: 'Até 3 opções' },
  { value: 'list', label: 'Lista', hint: 'Até 10 opções' },
  { value: 'cta_url', label: 'Link', hint: 'Um botão que abre um site' },
];

interface Props {
  value: InteractivePayload;
  onChange: (next: InteractivePayload) => void;
  problems?: string[];
}

export function InteractiveEditor({ value, onChange, problems = [] }: Props) {
  const set = (patch: Partial<InteractivePayload>) => onChange({ ...value, ...patch } as InteractivePayload);
  const rows = value.kind === 'list' ? value.sections[0]?.rows ?? [] : [];

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_260px]">
      <div className="space-y-3 min-w-0">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo">
          {KINDS.map((k) => (
            <Button key={k.value} type="button" size="sm" variant={value.kind === k.value ? 'default' : 'outline'}
              className="h-8 rounded-full px-3 text-xs" aria-pressed={value.kind === k.value} title={k.hint}
              onClick={() => onChange(switchKind(value, k.value))}>
              {k.label}
            </Button>
          ))}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between"><Label htmlFor="ix-body">Mensagem</Label><Counter value={value.body} max={L.body} /></div>
          <Textarea id="ix-body" rows={3} value={value.body} onChange={(e) => set({ body: e.target.value })} placeholder="Ex.: O seu bebê já nasceu ou você está grávida?" />
        </div>

        {value.kind === 'buttons' && (
          <div className="space-y-2">
            <Label>Botões</Label>
            {value.buttons.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={b.title} placeholder={`Botão ${i + 1}`} onChange={(e) => set({ buttons: value.buttons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                <Counter value={b.title} max={L.buttonTitle} />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Remover botão ${i + 1}`} disabled={value.buttons.length <= 1}
                  onClick={() => set({ buttons: value.buttons.filter((_, j) => j !== i) })}><Trash className="h-4 w-4" /></Button>
              </div>
            ))}
            {value.buttons.length < L.buttonsMax && (
              <Button type="button" variant="outline" size="sm" onClick={() => set({ buttons: [...value.buttons, { id: '', title: '' }] })}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar botão
              </Button>
            )}
          </div>
        )}

        {value.kind === 'list' && (
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between"><Label htmlFor="ix-btn">Texto do botão que abre a lista</Label><Counter value={value.buttonText} max={L.listButtonText} /></div>
              <Input id="ix-btn" value={value.buttonText} onChange={(e) => set({ buttonText: e.target.value })} />
            </div>
            <Label>Opções</Label>
            {rows.map((r, i) => (
              <div key={i} className="space-y-1 rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <Input value={r.title} placeholder={`Opção ${i + 1}`} onChange={(e) => set({ sections: [{ ...value.sections[0], rows: rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }] })} />
                  <Counter value={r.title} max={L.rowTitle} />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Remover opção ${i + 1}`} disabled={rows.length <= 1}
                    onClick={() => set({ sections: [{ ...value.sections[0], rows: rows.filter((_, j) => j !== i) }] })}><Trash className="h-4 w-4" /></Button>
                </div>
                <Input value={r.description ?? ''} placeholder="Descrição (opcional)" className="h-8 text-xs"
                  onChange={(e) => set({ sections: [{ ...value.sections[0], rows: rows.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) }] })} />
              </div>
            ))}
            {rows.length < L.listRowsMax && (
              <Button type="button" variant="outline" size="sm" onClick={() => set({ sections: [{ ...value.sections[0], rows: [...rows, { id: '', title: '' }] }] })}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar opção
              </Button>
            )}
          </div>
        )}

        {value.kind === 'cta_url' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between"><Label htmlFor="ix-cta">Texto do botão</Label><Counter value={value.displayText} max={L.ctaDisplayText} /></div>
              <Input id="ix-cta" value={value.displayText} placeholder="Ex.: Ver contrato" onChange={(e) => set({ displayText: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ix-url">Link</Label>
              <Input id="ix-url" type="url" value={value.url} placeholder="https://" onChange={(e) => set({ url: e.target.value })} />
            </div>
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between"><Label htmlFor="ix-footer">Rodapé (opcional)</Label><Counter value={value.footer} max={L.footer} /></div>
          <Input id="ix-footer" value={value.footer ?? ''} onChange={(e) => set({ footer: e.target.value })} />
        </div>

        {problems.length > 0 && (
          <ul className="space-y-0.5 text-xs text-destructive" aria-live="polite">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
      </div>

      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Prévia</span>
        <div className="rounded-lg bg-muted/50 p-3">
          <InteractiveMessageCard payload={value} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Botões e lista só podem ser enviados até 24 h depois da última mensagem da cliente. Em números que não usam a API oficial da Meta, a mensagem sai como texto numerado.
        </p>
      </div>
    </div>
  );
}

// Painel único de filtros da lista de conversas do Comercial.
// Uma linha por filtro (nome + lista suspensa de múltipla escolha). Tudo é filtrado no servidor
// (ver src/lib/commercialThreadFilters.ts).
import { useMemo, useState } from 'react';
import { CaretDown, Check, FunnelSimple, X } from '@phosphor-icons/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { SalesEndpointFilterOption } from '@/hooks/useSalesEndpointFilterOptions';
import type { OrgUserFilterOption } from '@/hooks/useOrgUserFilterOptions';
import type { AdOption, StageOption, TagOption } from '@/hooks/useCommercialFilterOptions';
import {
  type CardDisplayPrefs, type CommercialThreadFilters, type OppState, type ThreadHandler, type ThreadView,
  clearPanelFilters, countActivePanelFilters,
} from '@/lib/commercialThreadFilters';

interface Props {
  locale: string;
  value: CommercialThreadFilters;
  onChange: (next: CommercialThreadFilters) => void;
  endpoints: SalesEndpointFilterOption[];
  users: OrgUserFilterOption[];
  stages: StageOption[];
  tags: TagOption[];
  ads: AdOption[];
  aiEnabled: boolean;
  cardPrefs: CardDisplayPrefs;
  onCardPrefsChange: (next: CardDisplayPrefs) => void;
}

interface Opt { value: string; label: string; color?: string | null; hint?: string }

/** Lista suspensa com múltipla escolha (nenhuma = todas). */
function MultiSelect({ options, selected, onChange, allLabel, searchable, searchPlaceholder, ariaLabel }: {
  options: Opt[]; selected: string[]; onChange: (next: string[]) => void; allLabel: string;
  searchable?: boolean; searchPlaceholder?: string; ariaLabel: string;
}) {
  const [q, setQ] = useState('');
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options;
  }, [options, q]);
  const summary = selected.length === 0
    ? allLabel
    : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? '1')
      : `${options.find((o) => o.value === selected[0])?.label ?? ''} +${selected.length - 1}`;
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            'flex h-8 w-full min-w-0 items-center justify-between gap-1 rounded-md border bg-background px-2 text-left text-xs',
            selected.length ? 'border-primary text-foreground' : 'text-muted-foreground',
          )}
        >
          <span className="truncate">{summary}</span>
          <CaretDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[200px] p-1">
        {searchable && (
          <Input className="mb-1 h-7 text-xs" placeholder={searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} />
        )}
        <div className="no-scrollbar max-h-56 overflow-y-auto overflow-x-hidden">
          {visible.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => toggle(o.value)}
                className="flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                <span className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                  {on && <Check className="h-2.5 w-2.5" weight="bold" />}
                </span>
                {o.color !== undefined && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: o.color || '#94a3b8' }} />}
                <span className="truncate">{o.label}</span>
                {o.hint && <span className="ml-auto shrink-0 text-muted-foreground">{o.hint}</span>}
              </button>
            );
          })}
          {visible.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">—</p>}
        </div>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted">
            {allLabel}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function DateRange({ from, to, onChange, labels }: { from: string; to: string; onChange: (from: string, to: string) => void; labels: [string, string] }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 min-w-0">
      <input type="date" aria-label={labels[0]} value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)}
        className="h-8 w-full min-w-0 rounded-md border bg-background px-1.5 text-xs" />
      <input type="date" aria-label={labels[1]} value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)}
        className="h-8 w-full min-w-0 rounded-md border bg-background px-1.5 text-xs" />
    </div>
  );
}

export function CommercialFiltersPanel(p: Props) {
  const pt = p.locale !== 'en-US';
  const L = (ptText: string, enText: string) => (pt ? ptText : enText);
  const [open, setOpen] = useState(false);
  const f = p.value;
  const set = (patch: Partial<CommercialThreadFilters>) => p.onChange({ ...f, ...patch });
  const activeCount = countActivePanelFilters(f);
  const all = L('Todas', 'All');

  const handlerOpts: Opt[] = [
    { value: 'ai', label: L('IA atendendo', 'AI handling') },
    { value: 'needs_human', label: L('Pediu humano', 'Needs human') },
    { value: 'none', label: L('Sem ninguém', 'Nobody') },
  ];
  const ownerOpts: Opt[] = [{ value: '__unassigned__', label: L('Sem responsável', 'Unassigned') }, ...p.users.map((u) => ({ value: u.id, label: u.fullName }))];
  const ownerSelected = [...(f.unassigned ? ['__unassigned__'] : []), ...f.assignedUserIds];
  const oppOpts: Opt[] = [
    { value: 'open', label: L('Com oportunidade aberta', 'With open opportunity') },
    { value: 'none', label: L('Sem oportunidade aberta', 'Without open opportunity') },
    { value: 'won', label: L('Ganha', 'Won') },
    { value: 'lost', label: L('Perdida', 'Lost') },
  ];
  const stageOpts: Opt[] = p.stages.filter((s) => s.type === 'custom').map((s) => ({ value: s.id, label: s.name }));
  const tagOpts: Opt[] = p.tags.map((t) => ({ value: t.id, label: t.name, color: t.color }));
  const adOpts: Opt[] = p.ads.map((a) => ({ value: a.id, label: a.label, hint: String(a.count) }));
  const endpointOpts: Opt[] = p.endpoints.map((o) => ({ value: o.key, label: o.address }));
  const endpointSelected = p.endpoints.filter((o) => o.endpointIds.some((id) => f.endpointIds.includes(id))).map((o) => o.key);
  const originOpts: Opt[] = [{ value: 'ad', label: L('Veio de anúncio', 'From an ad') }, { value: 'organic', label: L('Orgânica', 'Organic') }];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" title={L('Filtros', 'Filters')}>
          <FunnelSimple className="h-4 w-4" />
          <span className="text-xs">{L('Filtros', 'Filters')}</span>
          {activeCount > 0 && (
            <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{activeCount}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12} className="w-[340px] max-w-[calc(100vw-24px)] overflow-hidden p-0">
        <div className="no-scrollbar max-h-[70vh] space-y-2 overflow-y-auto overflow-x-hidden p-3">
          <Row label={L('Situação', 'Status')}>
            <MultiSelect ariaLabel={L('Situação', 'Status')} allLabel={L('Abertas', 'Open')}
              options={[
                { value: 'to_reply', label: L('Para responder', 'To reply') },
                { value: 'awaiting_client', label: L('Aguardando cliente', 'Awaiting customer') },
                { value: 'resolved', label: L('Encerradas', 'Closed') },
              ]}
              selected={f.view === 'open' ? [] : [f.view]}
              onChange={(v) => set({ view: ((v.find((x) => x !== f.view) ?? v[0]) || 'open') as ThreadView })} />
          </Row>
          {p.aiEnabled && (
            <Row label={L('Quem atende', 'Handled by')}>
              <MultiSelect ariaLabel={L('Quem atende', 'Handled by')} allLabel={all} options={handlerOpts} selected={f.handlers}
                onChange={(v) => set({ handlers: v as ThreadHandler[] })} />
            </Row>
          )}
          <Row label={L('Responsável', 'Owner')}>
            <MultiSelect ariaLabel={L('Responsável', 'Owner')} allLabel={all} options={ownerOpts} selected={ownerSelected}
              onChange={(v) => set({ unassigned: v.includes('__unassigned__'), assignedUserIds: v.filter((x) => x !== '__unassigned__') })} />
          </Row>
          <Row label={L('Oportunidade', 'Opportunity')}>
            <MultiSelect ariaLabel={L('Oportunidade', 'Opportunity')} allLabel={all} options={oppOpts} selected={f.oppStates}
              onChange={(v) => set({ oppStates: v as OppState[] })} />
          </Row>
          {stageOpts.length > 0 && (
            <Row label={L('Etapa', 'Stage')}>
              <MultiSelect ariaLabel={L('Etapa', 'Stage')} allLabel={all} options={stageOpts} selected={f.stageIds} onChange={(v) => set({ stageIds: v })} />
            </Row>
          )}
          {tagOpts.length > 0 && (
            <Row label={L('Etiqueta', 'Tag')}>
              <MultiSelect ariaLabel={L('Etiqueta da oportunidade', 'Opportunity tag')} allLabel={all} options={tagOpts} selected={f.oppTagIds}
                onChange={(v) => set({ oppTagIds: v })} searchable={tagOpts.length > 8} searchPlaceholder={L('Buscar etiqueta...', 'Search tag...')} />
            </Row>
          )}
          <Row label={L('Origem', 'Source')}>
            <MultiSelect ariaLabel={L('Origem', 'Source')} allLabel={all} options={originOpts} selected={f.origin ? [f.origin] : []}
              onChange={(v) => {
                // Uma opção só: vale a última marcada; desmarcar tudo volta para "Todas".
                const origin = (v.find((x) => x !== f.origin) ?? v[0] ?? '') as CommercialThreadFilters['origin'];
                set({ origin, adIds: origin === 'organic' ? [] : f.adIds });
              }} />
          </Row>
          {adOpts.length > 0 && f.origin !== 'organic' && (
            <Row label={L('Anúncio', 'Ad')}>
              <MultiSelect ariaLabel={L('Anúncio', 'Ad')} allLabel={L('Todos', 'All')} options={adOpts} selected={f.adIds}
                onChange={(v) => set({ adIds: v })} searchable={adOpts.length > 8} searchPlaceholder={L('Buscar anúncio...', 'Search ad...')} />
            </Row>
          )}
          {endpointOpts.length > 1 && (
            <Row label={L('Número', 'Number')}>
              <MultiSelect ariaLabel={L('Número', 'Number')} allLabel={L('Todos', 'All')} options={endpointOpts} selected={endpointSelected}
                onChange={(keys) => set({ endpointIds: [...new Set(p.endpoints.filter((o) => keys.includes(o.key)).flatMap((o) => o.endpointIds))] })} />
            </Row>
          )}
          <Row label={L('Criada em', 'Created')}>
            <DateRange from={f.createdFrom} to={f.createdTo} labels={[L('Criada de', 'Created from'), L('Criada até', 'Created to')]}
              onChange={(a, b) => set({ createdFrom: a, createdTo: b })} />
          </Row>
          <Row label={L('Última mensagem', 'Last message')}>
            <DateRange from={f.lastFrom} to={f.lastTo} labels={[L('Última mensagem de', 'Last message from'), L('Última mensagem até', 'Last message to')]}
              onChange={(a, b) => set({ lastFrom: a, lastTo: b })} />
          </Row>
          <Row label={L('Não lidas', 'Unread')}>
            <Switch checked={f.unread} onCheckedChange={(v) => set({ unread: v })} aria-label={L('Só não lidas', 'Unread only')} />
          </Row>

          <div className="border-t pt-2">
            <p className="mb-1.5 text-xs text-muted-foreground">{L('Exibir no card', 'Show on card')}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {([
                ['stage', L('Etapa', 'Stage')],
                ['tags', L('Etiquetas', 'Tags')],
                ['endpoint', L('Número', 'Number')],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5 text-xs">
                  <Switch checked={p.cardPrefs[k]} onCheckedChange={(v) => p.onCardPrefsChange({ ...p.cardPrefs, [k]: v })} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2">
          <Button variant="ghost" size="sm" disabled={activeCount === 0} onClick={() => p.onChange(clearPanelFilters(f))}>
            {L('Limpar filtros', 'Clear filters')}
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>{L('Pronto', 'Done')}</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Etiquetas dos filtros ativos, com "x" para tirar cada um. */
export function ActiveFilterChips(p: Pick<Props, 'locale' | 'value' | 'onChange' | 'users' | 'stages' | 'tags' | 'ads' | 'endpoints'>) {
  const pt = p.locale !== 'en-US';
  const L = (a: string, b: string) => (pt ? a : b);
  const f = p.value;
  const set = (patch: Partial<CommercialThreadFilters>) => p.onChange({ ...f, ...patch });
  const fmt = (d: string) => (d ? d.split('-').reverse().join('/') : '…');
  const items: Array<{ key: string; label: string; clear: () => void }> = [];
  const handlerLabel: Record<ThreadHandler, string> = { ai: L('IA atendendo', 'AI handling'), needs_human: L('Pediu humano', 'Needs human'), none: L('Sem ninguém', 'Nobody') };
  const oppLabel: Record<OppState, string> = { open: L('Com oportunidade aberta', 'Open opportunity'), none: L('Sem oportunidade aberta', 'No open opportunity'), won: L('Ganha', 'Won'), lost: L('Perdida', 'Lost') };

  const viewLabel: Record<ThreadView, string> = { open: L('Abertas', 'Open'), to_reply: L('Para responder', 'To reply'), awaiting_client: L('Aguardando cliente', 'Awaiting customer'), resolved: L('Encerradas', 'Closed') };
  if (f.view !== 'open') items.push({ key: 'view', label: viewLabel[f.view], clear: () => set({ view: 'open' }) });
  f.handlers.forEach((h) => items.push({ key: `h-${h}`, label: handlerLabel[h], clear: () => set({ handlers: f.handlers.filter((x) => x !== h) }) }));
  if (f.unassigned) items.push({ key: 'unassigned', label: L('Sem responsável', 'Unassigned'), clear: () => set({ unassigned: false }) });
  f.assignedUserIds.forEach((id) => items.push({ key: `u-${id}`, label: p.users.find((u) => u.id === id)?.fullName ?? L('Responsável', 'Owner'), clear: () => set({ assignedUserIds: f.assignedUserIds.filter((x) => x !== id) }) }));
  f.oppStates.forEach((s) => items.push({ key: `o-${s}`, label: oppLabel[s], clear: () => set({ oppStates: f.oppStates.filter((x) => x !== s) }) }));
  f.stageIds.forEach((id) => items.push({ key: `s-${id}`, label: p.stages.find((s) => s.id === id)?.name ?? L('Etapa', 'Stage'), clear: () => set({ stageIds: f.stageIds.filter((x) => x !== id) }) }));
  f.oppTagIds.forEach((id) => items.push({ key: `t-${id}`, label: p.tags.find((t) => t.id === id)?.name ?? L('Etiqueta', 'Tag'), clear: () => set({ oppTagIds: f.oppTagIds.filter((x) => x !== id) }) }));
  if (f.createdFrom || f.createdTo) items.push({ key: 'created', label: `${L('Criada', 'Created')} ${fmt(f.createdFrom)}–${fmt(f.createdTo)}`, clear: () => set({ createdFrom: '', createdTo: '' }) });
  if (f.lastFrom || f.lastTo) items.push({ key: 'last', label: `${L('Última msg', 'Last msg')} ${fmt(f.lastFrom)}–${fmt(f.lastTo)}`, clear: () => set({ lastFrom: '', lastTo: '' }) });
  if (f.origin) items.push({ key: 'origin', label: f.origin === 'ad' ? L('Veio de anúncio', 'From an ad') : L('Orgânica', 'Organic'), clear: () => set({ origin: '' }) });
  f.adIds.forEach((id) => items.push({ key: `a-${id}`, label: p.ads.find((a) => a.id === id)?.label ?? id, clear: () => set({ adIds: f.adIds.filter((x) => x !== id) }) }));
  const selectedNumbers = p.endpoints.filter((o) => o.endpointIds.some((id) => f.endpointIds.includes(id)));
  selectedNumbers.forEach((o) => items.push({ key: `e-${o.key}`, label: o.address, clear: () => set({ endpointIds: f.endpointIds.filter((id) => !o.endpointIds.includes(id)) }) }));
  if (f.unread) items.push({ key: 'unread', label: L('Não lidas', 'Unread'), clear: () => set({ unread: false }) });

  if (!items.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1">
      {items.map((it) => (
        <span key={it.key} className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
          <span className="truncate">{it.label}</span>
          <button type="button" aria-label={L(`Tirar filtro ${it.label}`, `Remove filter ${it.label}`)} onClick={it.clear} className="text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

// Painel único de filtros da lista de conversas do Comercial.
// Tudo é filtrado no servidor (ver src/lib/commercialThreadFilters.ts).
import { useMemo, useState } from 'react';
import { FunnelSimple, X, SlidersHorizontal } from '@phosphor-icons/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { SalesEndpointFilterOption } from '@/hooks/useSalesEndpointFilterOptions';
import type { OrgUserFilterOption } from '@/hooks/useOrgUserFilterOptions';
import type { AdOption, StageOption, TagOption } from '@/hooks/useCommercialFilterOptions';
import {
  type CardDisplayPrefs, type CommercialThreadFilters, type OppState, type ThreadHandler,
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

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs transition max-w-full truncate',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function CommercialFiltersPanel(p: Props) {
  const pt = p.locale !== 'en-US';
  const L = (ptText: string, enText: string) => (pt ? ptText : enText);
  const [open, setOpen] = useState(false);
  const [adQuery, setAdQuery] = useState('');
  const f = p.value;
  const set = (patch: Partial<CommercialThreadFilters>) => p.onChange({ ...f, ...patch });
  const activeCount = countActivePanelFilters(f);

  const openStages = p.stages.filter((s) => s.type === 'custom');
  const visibleAds = useMemo(() => {
    const q = adQuery.trim().toLowerCase();
    const list = q ? p.ads.filter((a) => a.label.toLowerCase().includes(q) || a.id.includes(q)) : p.ads;
    return list.slice(0, 30);
  }, [p.ads, adQuery]);

  const endpointSelected = (o: SalesEndpointFilterOption) => o.endpointIds.some((id) => f.endpointIds.includes(id));
  const toggleEndpoint = (o: SalesEndpointFilterOption) => {
    const sel = endpointSelected(o);
    set({ endpointIds: sel ? f.endpointIds.filter((id) => !o.endpointIds.includes(id)) : [...new Set([...f.endpointIds, ...o.endpointIds])] });
  };

  const handlerOpts: Array<{ k: ThreadHandler; label: string; title: string }> = [
    { k: 'ai', label: L('IA atendendo', 'AI handling'), title: L('A IA está conversando e ninguém da equipe assumiu', 'The AI is handling it and nobody took it') },
    { k: 'needs_human', label: L('Pediu humano', 'Needs human'), title: L('A IA passou para a equipe e ninguém assumiu', 'The AI handed it over and nobody took it') },
    { k: 'none', label: L('Sem ninguém', 'Nobody'), title: L('Sem IA e sem responsável', 'No AI and no owner') },
  ];
  const oppOpts: Array<{ k: OppState; label: string }> = [
    { k: 'open', label: L('Com oportunidade aberta', 'With open opportunity') },
    { k: 'none', label: L('Sem oportunidade aberta', 'Without open opportunity') },
    { k: 'won', label: L('Ganha', 'Won') },
    { k: 'lost', label: L('Perdida', 'Lost') },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 relative" title={L('Filtros', 'Filters')}>
          <FunnelSimple className="h-4 w-4" />
          <span className="text-xs">{L('Filtros', 'Filters')}</span>
          {activeCount > 0 && (
            <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{activeCount}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="max-h-[70vh] overflow-y-auto space-y-4 p-4">
          {p.aiEnabled && (
            <Section title={L('Quem atende', 'Handled by')}>
              {handlerOpts.map((o) => (
                <Chip key={o.k} active={f.handlers.includes(o.k)} title={o.title} onClick={() => set({ handlers: toggle(f.handlers, o.k) })}>{o.label}</Chip>
              ))}
            </Section>
          )}

          <Section title={L('Responsável', 'Owner')}>
            <Chip active={f.unassigned} onClick={() => set({ unassigned: !f.unassigned })}>{L('Sem responsável', 'Unassigned')}</Chip>
            {p.users.map((u) => (
              <Chip key={u.id} active={f.assignedUserIds.includes(u.id)} onClick={() => set({ assignedUserIds: toggle(f.assignedUserIds, u.id) })}>{u.fullName}</Chip>
            ))}
          </Section>

          <Section title={L('Oportunidade', 'Opportunity')}>
            {oppOpts.map((o) => (
              <Chip key={o.k} active={f.oppStates.includes(o.k)} onClick={() => set({ oppStates: toggle(f.oppStates, o.k) })}>{o.label}</Chip>
            ))}
          </Section>

          {openStages.length > 0 && (
            <Section title={L('Etapa', 'Stage')}>
              {openStages.map((s) => (
                <Chip key={s.id} active={f.stageIds.includes(s.id)} onClick={() => set({ stageIds: toggle(f.stageIds, s.id) })}>{s.name}</Chip>
              ))}
            </Section>
          )}

          {p.tags.length > 0 && (
            <Section title={L('Etiqueta da oportunidade', 'Opportunity tag')}>
              {p.tags.map((t) => (
                <Chip key={t.id} active={f.oppTagIds.includes(t.id)} onClick={() => set({ oppTagIds: toggle(f.oppTagIds, t.id) })}>
                  <span className="inline-block h-2 w-2 rounded-full mr-1 align-middle" style={{ backgroundColor: t.color || '#94a3b8' }} />
                  {t.name}
                </Chip>
              ))}
            </Section>
          )}

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{L('Conversa criada em', 'Conversation created')}</p>
            <div className="flex items-center gap-2">
              <Input type="date" className="h-8 text-xs" aria-label={L('Criada de', 'Created from')} value={f.createdFrom} onChange={(e) => set({ createdFrom: e.target.value })} />
              <span className="text-xs text-muted-foreground">{L('até', 'to')}</span>
              <Input type="date" className="h-8 text-xs" aria-label={L('Criada até', 'Created to')} value={f.createdTo} onChange={(e) => set({ createdTo: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{L('Última mensagem em', 'Last message')}</p>
            <div className="flex items-center gap-2">
              <Input type="date" className="h-8 text-xs" aria-label={L('Última mensagem de', 'Last message from')} value={f.lastFrom} onChange={(e) => set({ lastFrom: e.target.value })} />
              <span className="text-xs text-muted-foreground">{L('até', 'to')}</span>
              <Input type="date" className="h-8 text-xs" aria-label={L('Última mensagem até', 'Last message to')} value={f.lastTo} onChange={(e) => set({ lastTo: e.target.value })} />
            </div>
          </div>

          <Section title={L('Origem', 'Source')}>
            <Chip active={f.origin === 'ad'} onClick={() => set({ origin: f.origin === 'ad' ? '' : 'ad' })}>{L('Veio de anúncio', 'From an ad')}</Chip>
            <Chip active={f.origin === 'organic'} onClick={() => set({ origin: f.origin === 'organic' ? '' : 'organic', adIds: [] })}>{L('Orgânica', 'Organic')}</Chip>
          </Section>

          {p.ads.length > 0 && f.origin !== 'organic' && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{L('Qual anúncio', 'Which ad')}</p>
              {p.ads.length > 8 && (
                <Input className="h-8 text-xs" placeholder={L('Buscar anúncio...', 'Search ad...')} value={adQuery} onChange={(e) => setAdQuery(e.target.value)} />
              )}
              <div className="flex flex-wrap gap-1.5">
                {visibleAds.map((a) => (
                  <Chip key={a.id} active={f.adIds.includes(a.id)} title={`${a.label} · ${a.id}`} onClick={() => set({ adIds: toggle(f.adIds, a.id) })}>
                    {a.label} <span className="opacity-60">({a.count})</span>
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {p.endpoints.length > 1 && (
            <Section title={L('Número', 'Number')}>
              {p.endpoints.map((o) => (
                <Chip key={o.key} active={endpointSelected(o)} onClick={() => toggleEndpoint(o)}>{o.address}</Chip>
              ))}
            </Section>
          )}

          <Section title={L('Outros', 'Other')}>
            <Chip active={f.unread} onClick={() => set({ unread: !f.unread })}>{L('Não lidas', 'Unread')}</Chip>
          </Section>

          <div className="space-y-2 border-t pt-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <SlidersHorizontal className="h-3.5 w-3.5" />{L('Exibir no card', 'Show on card')}
            </p>
            {([
              ['stage', L('Etapa da oportunidade', 'Opportunity stage')],
              ['tags', L('Etiquetas da oportunidade', 'Opportunity tags')],
              ['endpoint', L('Número', 'Number')],
            ] as const).map(([k, label]) => (
              <label key={k} className="flex items-center justify-between gap-2 text-sm">
                <span>{label}</span>
                <Switch checked={p.cardPrefs[k]} onCheckedChange={(v) => p.onCardPrefsChange({ ...p.cardPrefs, [k]: v })} />
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-2">
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

import { ReactNode, useMemo, useState } from 'react';
import { CaretDown, MagnifyingGlass } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

export interface RRPersonItem {
  id: string;
  name: string;
  email: string;
  profileName: string;
  active: boolean;
}

interface Props<T extends RRPersonItem> {
  items: T[];
  renderRow: (item: T) => ReactNode;
  blocked?: T[];
  renderBlocked?: (item: T) => ReactNode;
  emptyText?: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const cmp = (a: string, b: string) => a.localeCompare(b, 'pt-BR');

/** Lista apresentacional: busca, filtro, agrupamento por perfil e grupos recolhíveis. */
export function RoundRobinPeopleList<T extends RRPersonItem>({ items, renderRow, blocked = [], renderBlocked, emptyText }: Props<T>) {
  const [q, setQ] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const query = norm(q.trim());
  const match = (p: T) => !query || norm(p.name).includes(query) || norm(p.email || '').includes(query);

  const groups = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const p of items) {
      const k = p.profileName || 'Sem perfil';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return [...map.entries()]
      .map(([name, people]) => ({
        name,
        total: people.length,
        activeCount: people.filter((p) => p.active).length,
        people: [...people].sort((a, b) => (a.active === b.active ? cmp(a.name, b.name) : a.active ? -1 : 1)),
      }))
      .sort((a, b) => ((a.activeCount > 0) === (b.activeCount > 0) ? cmp(a.name, b.name) : a.activeCount > 0 ? -1 : 1));
  }, [items]);

  const visible = groups
    .map((g) => ({ ...g, shown: g.people.filter((p) => match(p) && (!onlyActive || p.active)) }))
    .filter((g) => g.shown.length > 0);
  const blockedShown = onlyActive ? [] : blocked.filter(match).sort((a, b) => cmp(a.name, b.name));

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <MagnifyingGlass size={16} weight="light" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pessoa..." className="pl-9" />
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={onlyActive ? 'active' : 'all'}
          onValueChange={(v) => v && setOnlyActive(v === 'active')}
          className="justify-start"
        >
          <ToggleGroupItem value="all">Todos</ToggleGroupItem>
          <ToggleGroupItem value="active">Só ativos na lista</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {items.length === 0 && blocked.length === 0 && emptyText ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{emptyText}</p>
      ) : visible.length === 0 && blockedShown.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma pessoa encontrada.</p>
      ) : null}

      {visible.map((g) => {
        const open = query ? true : openMap[g.name] ?? g.activeCount > 0;
        return (
          <Collapsible key={g.name} open={open} onOpenChange={(o) => setOpenMap((m) => ({ ...m, [g.name]: o }))}>
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 py-2 text-left">
              <span className="text-sm font-semibold truncate">
                {g.name} <span className="font-normal text-muted-foreground">· {g.activeCount} de {g.total} ativas</span>
              </span>
              <CaretDown size={14} className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2">
              {g.shown.map((p) => <div key={p.id}>{renderRow(p)}</div>)}
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {blockedShown.length > 0 && (
        <div className="pt-4 mt-2 border-t space-y-1">
          {blockedShown.map((p) => (
            <div key={p.id}>
              {renderBlocked ? renderBlocked(p) : <p className="text-sm text-muted-foreground">{p.name}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

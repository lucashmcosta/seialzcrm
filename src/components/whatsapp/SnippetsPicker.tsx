// Snippets picker — popover with search + category groups.
// Selecting a snippet fills the composer via `onSelect` (does NOT send).

import { useMemo, useState, useEffect } from 'react';
import { Lightning, MagnifyingGlass } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { MessageSnippet } from '@/hooks/useSnippets';

interface Props {
  snippets: MessageSnippet[];
  onSelect: (snippet: MessageSnippet) => void;
  disabled?: boolean;
  highlighted?: boolean;
  /** External open control (used by `/` shortcut in composer). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Initial search query when opened via shortcut. */
  initialQuery?: string;
}

export function SnippetsPicker({
  snippets,
  onSelect,
  disabled,
  highlighted,
  open: openProp,
  onOpenChange,
  initialQuery,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };

  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery(initialQuery ?? '');
  }, [open, initialQuery]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snippets;
    return snippets.filter((s) => {
      return (
        s.title.toLowerCase().includes(q) ||
        (s.shortcut ?? '').toLowerCase().includes(q) ||
        s.body.toLowerCase().includes(q)
      );
    });
  }, [snippets, query]);

  const groups = useMemo(() => {
    const map = new Map<string, MessageSnippet[]>();
    for (const s of filtered) {
      const cat = s.category ?? 'Outros';
      const arr = map.get(cat) ?? [];
      arr.push(s);
      map.set(cat, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const handleSelect = (s: MessageSnippet) => {
    onSelect(s);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault();
      handleSelect(filtered[0]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={highlighted ? 'default' : 'ghost'}
          size="icon"
          disabled={disabled}
          className={cn(
            'h-10 w-10',
            highlighted && 'bg-primary text-primary-foreground hover:bg-primary/90 ring-2 ring-primary/40',
          )}
          title="Snippets (respostas prontas)"
        >
          <Lightning className="h-5 w-5" weight={highlighted ? 'fill' : 'regular'} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[360px] p-0">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <MagnifyingGlass className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar por título, atalho ou texto..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ScrollArea className="max-h-[320px]">
          {groups.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhum snippet encontrado.
            </div>
          ) : (
            <div className="p-1">
              {groups.map(([category, items]) => (
                <div key={category} className="mb-1">
                  <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {category}
                  </div>
                  {items.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelect(s)}
                      className="w-full rounded-md px-2 py-2 text-left hover:bg-accent focus:bg-accent focus:outline-none"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{s.title}</span>
                        {s.shortcut && (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {s.shortcut}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground whitespace-pre-line">
                        {s.body}
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          Enter seleciona o primeiro · variáveis são preenchidas ao inserir
        </div>
      </PopoverContent>
    </Popover>
  );
}

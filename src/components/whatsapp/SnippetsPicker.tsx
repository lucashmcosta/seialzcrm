// Snippets picker — panel with search + category groups.
// Usado como painel flutuante controlado (sem botão trigger visível).
// A abertura é feita pelo composer via slash command.

import { useMemo, useState, useEffect, useRef } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { MessageSnippet } from '@/hooks/useSnippets';

interface Props {
  snippets: MessageSnippet[];
  onSelect: (snippet: MessageSnippet) => void;
  onClose: () => void;
  query?: string;
  className?: string;
}

export function SnippetsPickerPanel({ snippets, onSelect, onClose, query = '', className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snippets;
    return snippets.filter((s) => (
      s.title.toLowerCase().includes(q) ||
      (s.shortcut ?? '').toLowerCase().includes(q) ||
      s.body.toLowerCase().includes(q)
    ));
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

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className={
        (className ? className + ' ' : '') +
        'absolute bottom-full left-0 right-0 mb-1 z-30 rounded-md border border-border bg-popover text-popover-foreground shadow-lg'
      }
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <MagnifyingGlass className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {query ? `Buscando "/${query}"` : 'Digite para filtrar snippets · Enter seleciona o primeiro · Esc fecha'}
        </span>
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
                    onClick={() => onSelect(s)}
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
    </div>
  );
}

/** Utilitário: dado texto do composer, retorna a query de snippet ou null. */
export function extractSnippetQuery(text: string): string | null {
  if (!text.startsWith('/')) return null;
  // Não abrir com barra dupla / etc — se contém quebra de linha, cancela.
  if (text.includes('\n')) return null;
  return text.slice(1);
}

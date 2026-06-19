import { useState } from 'react';
import { cn } from '@/lib/utils';
import { CaretUpDown, Trophy } from '@phosphor-icons/react';

export interface UserStats {
  userId: string;
  fullName: string;
  open: number;
  created: number;
  won: number;
  lost: number;
  wonValue: number;
}

type SortKey = 'fullName' | 'open' | 'won' | 'lost' | 'winRate' | 'wonValue';

interface Props {
  rows: UserStats[];
  formatCurrency: (n: number) => string;
  loading?: boolean;
  onRowClick?: (row: UserStats) => void;
}

function initials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || '?'
  );
}

export function UserLeaderboard({ rows, formatCurrency, loading, onRowClick }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'wonValue',
    dir: 'desc',
  });

  const enriched = rows.map((r) => {
    const denom = r.won + r.lost;
    const winRate = denom > 0 ? (r.won / denom) * 100 : 0;
    return { ...r, winRate };
  });

  const sorted = [...enriched].sort((a, b) => {
    const va = a[sort.key as keyof typeof a] as any;
    const vb = b[sort.key as keyof typeof b] as any;
    if (typeof va === 'string') {
      return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return sort.dir === 'asc' ? va - vb : vb - va;
  });

  const maxValue = Math.max(...sorted.map((r) => r.wonValue), 1);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' },
    );
  };

  const Th = ({ k, label, align }: { k: SortKey; label: string; align?: 'right' }) => (
    <th
      className={cn(
        'cursor-pointer select-none px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground',
        align === 'right' ? 'text-right' : 'text-left',
      )}
      onClick={() => toggleSort(k)}
    >
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
        {label}
        <CaretUpDown size={11} weight={sort.key === k ? 'fill' : 'regular'} />
      </span>
    </th>
  );

  const trophyColor = (idx: number) =>
    idx === 0
      ? 'text-warning'
      : idx === 1
        ? 'text-muted-foreground'
        : idx === 2
          ? 'text-warning/60'
          : null;

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="border-b border-border p-5">
        <h3 className="text-sm font-semibold text-foreground">Ranking de vendedores</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Performance individual no período
        </p>
      </div>

      {loading ? (
        <div className="space-y-2 p-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Nenhum vendedor com dados no período
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="w-10 px-3 py-2.5"></th>
                <Th k="fullName" label="Vendedor" />
                <Th k="open" label="Abertas" align="right" />
                <Th k="won" label="Ganhas" align="right" />
                <Th k="lost" label="Perdidas" align="right" />
                <Th k="winRate" label="Conversão" align="right" />
                <Th k="wonValue" label="Valor Ganho" align="right" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => {
                const widthPct = (r.wonValue / maxValue) * 100;
                const tColor = trophyColor(idx);
                return (
                  <tr
                    key={r.userId}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={cn(
                      'group border-b border-border last:border-0 transition-colors hover:bg-muted/40',
                      onRowClick && 'cursor-pointer'
                    )}
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center">
                        {tColor ? (
                          <Trophy size={16} weight="fill" className={tColor} />
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">
                            {idx + 1}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {initials(r.fullName)}
                        </div>
                        <span className="truncate text-sm font-medium text-foreground">
                          {r.fullName}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-sm text-foreground">
                      {r.open}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-sm text-success">
                      {r.won}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-sm text-destructive">
                      {r.lost}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                        {r.winRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-muted md:block">
                          <div
                            className="h-full bg-gradient-to-r from-success/60 to-success"
                            style={{ width: `${Math.max(widthPct, 2)}%` }}
                          />
                        </div>
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {formatCurrency(r.wonValue)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

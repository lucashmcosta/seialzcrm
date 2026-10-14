import { useEffect, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useOrganization } from '@/hooks/useOrganization';
import type { WidgetContext } from '../types';
import { isDraw, winnerOf } from './ticTacToe';
import * as store from './store';
import { supabase } from '@/integrations/supabase/client';

store.watchSignOut((cb) => { supabase.auth.onAuthStateChange((event) => cb(event)); });

export function TicTacToeWidget(_props: { context: WidgetContext }) {
  const { organization, userProfile } = useOrganization();
  const key = organization?.id && userProfile?.id ? `${userProfile.id}:${organization.id}` : null;
  // bind antes de ler: chave nova nunca enxerga a partida anterior.
  store.bind(key, false);
  const game = useSyncExternalStore(store.subscribe, () => store.getSnapshot(key));
  useEffect(() => { store.bind(key); }, [key]);

  if (!key || !game) return null;
  const win = winnerOf(game.board);
  const draw = isDraw(game.board);
  const over = !!win || draw;
  const status = win ? (win.winner === 'X' ? 'Você venceu!' : 'Você perdeu.') : draw ? 'Empate.'
    : game.thinking ? 'Computador pensando…' : 'Sua vez (X)';

  return (
    <div className="flex h-full flex-col items-center gap-3">
      <div className={cn('font-data text-xs uppercase tracking-wider',
        win?.winner === 'X' ? 'text-primary' : win ? 'text-destructive' : 'text-muted-foreground')} role="status">
        {status}
      </div>
      <div className="grid w-full max-w-[260px] grid-cols-3 gap-1.5" role="grid" aria-label="Tabuleiro">
        {game.board.map((c, i) => {
          const hit = win?.line.includes(i);
          return (
            <button key={i} type="button" aria-label={`Casa ${i + 1}${c ? `: ${c}` : ''}`}
              disabled={!!c || over || game.thinking} onClick={() => store.play(key, i)}
              className={cn('aspect-square rounded-[6px] border border-border bg-muted font-data text-3xl transition-colors',
                !c && !over && !game.thinking && 'hover:bg-accent',
                c === 'X' ? 'text-primary' : 'text-foreground', hit && 'border-primary bg-[hsl(var(--sz-green-dim))]')}>
              {c ?? ''}
            </button>
          );
        })}
      </div>
      {over && <Button size="sm" onClick={() => store.reset(key)}>Jogar novamente</Button>}
    </div>
  );
}

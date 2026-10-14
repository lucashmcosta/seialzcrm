import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { WidgetDefinition } from '@/widgets/types';

type State = 'open' | 'minimized' | 'closed' | undefined;

interface Props { def: WidgetDefinition; state: State; index: number; disabled: boolean; onOpen: () => void }

/** Animações só visuais (transform/opacity): não mudam layout nem atrasam o clique. */
export function WidgetGalleryCard({ def, state, index, disabled, onOpen }: Props) {
  const reduce = useReducedMotion();
  const Icon = def.icon;
  const Preview = def.Preview;
  const label = state === 'open' ? 'Aberto' : state === 'minimized' ? 'No dock' : null;

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      aria-label={`Abrir ${def.name}${label ? ` (${label.toLowerCase()})` : ''}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3), ease: 'easeOut' }}
      whileHover={reduce || disabled ? undefined : { y: -2 }}
      whileTap={reduce || disabled ? undefined : { scale: 0.98 }}
      className={cn(
        'group flex flex-col overflow-hidden rounded-[6px] border border-border bg-card text-left shadow-sm transition-[border-color,box-shadow] duration-200',
        'hover:border-[hsl(var(--sz-green-border))] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      <div className="relative flex h-[140px] items-center justify-center overflow-hidden border-b border-border bg-muted">
        <div aria-hidden className="absolute inset-0 opacity-40 [background-image:linear-gradient(hsl(var(--border))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border))_1px,transparent_1px)] [background-size:16px_16px]" />
        <div aria-hidden className={cn('relative transition-transform duration-300 ease-out', !reduce && 'group-hover:scale-[1.02]')}>
          {Preview ? <Preview /> : <Icon size={48} weight="light" className="text-muted-foreground" />}
        </div>
      </div>
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[6px] bg-[hsl(var(--sz-green-dim))]">
          <Icon size={18} weight="bold" className="text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{def.name}</span>
            {label && (
              <span className="ml-auto flex flex-shrink-0 items-center gap-1.5 font-data text-[10px] uppercase tracking-wider text-muted-foreground">
                <span className={cn('h-1.5 w-1.5 rounded-full', state === 'open' ? 'bg-primary' : 'bg-muted-foreground')} />
                {label}
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{def.description}</p>
        </div>
      </div>
    </motion.button>
  );
}

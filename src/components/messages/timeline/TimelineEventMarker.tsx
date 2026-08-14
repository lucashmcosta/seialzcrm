import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TimelineEventMarkerProps {
  /** Rótulo do marco (ex.: "Atendente alterado"). */
  label: ReactNode;
  /** Valor auxiliar (ex.: "Maria → João" ou "7067 → 7020"). */
  value?: ReactNode;
  /** Horário formatado do evento. */
  time?: string;
  icon?: ReactNode;
  className?: string;
  /** Torna o conteúdo central clicável (sem aparência de botão). */
  interactive?: boolean;
  onClick?: () => void;
}

/**
 * Marco histórico da timeline (conceito Kommo): separador fino e discreto,
 * nunca um balão de mensagem. Puramente visual.
 */
export function TimelineEventMarker({
  label,
  value,
  time,
  icon,
  className,
  interactive,
  onClick,
}: TimelineEventMarkerProps) {
  const content = (
    <>
      {icon && <span className="flex items-center [&>svg]:h-3 [&>svg]:w-3">{icon}</span>}
      <span>{label}</span>
      {value && <span className="font-data text-foreground/70">{value}</span>}
      {time && <span className="text-[10px] text-muted-foreground/70">{time}</span>}
    </>
  );

  return (
    <div className={cn('flex items-center gap-2 my-2', className)}>
      <div className="h-px flex-1 bg-border/50" />
      {interactive ? (
        <button
          type="button"
          onClick={onClick}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors leading-4 whitespace-nowrap bg-transparent border-0 p-0 cursor-pointer"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground leading-4 whitespace-nowrap">
          {content}
        </div>
      )}
      <div className="h-px flex-1 bg-border/50" />
    </div>
  );
}


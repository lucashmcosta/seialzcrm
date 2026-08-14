import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CaretDown, CaretUp } from '@phosphor-icons/react';
import {
  DEFAULT_BLOCK_BUDGET_PX,
  FALLBACK_ITEM_HEIGHT,
  resolveBlockCollapseByHeight,
} from '@/lib/messageGrouping';
import { TimelineEventMarker } from './TimelineEventMarker';

interface TimelineBlockProps {
  /** Cabeçalho do container (canal/número). */
  headerNodes: ReactNode[];
  /** Mensagens do container, em ordem cronológica. */
  messageNodes: ReactNode[];
  /** Último container da timeline: nunca colapsa. */
  isCurrent: boolean;
  locale: string;
  className?: string;
}

/**
 * Container de contexto da timeline com colapso por ESPAÇO VISUAL.
 *
 * A decisão usa a altura REAL renderizada de cada item (medida no DOM);
 * apenas antes da primeira medição usa-se um fallback aproximado para evitar
 * layout shift. Puramente visual — nenhuma regra de negócio aqui.
 */
export function TimelineBlock({
  headerNodes,
  messageNodes,
  isCurrent,
  locale,
  className,
}: TimelineBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [budget, setBudget] = useState(DEFAULT_BLOCK_BUDGET_PX);
  const [heights, setHeights] = useState<number[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const heightsRef = useRef<number[]>([]);

  // Orçamento = altura visível da área de conversa.
  useEffect(() => {
    const measure = () => {
      const viewport = containerRef.current?.closest(
        '[data-radix-scroll-area-viewport]',
      ) as HTMLElement | null;
      const h = viewport?.clientHeight ?? 0;
      if (h > 0) setBudget(h);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const total = messageNodes.length;

  const collapse = useMemo(() => {
    const list = Array.from({ length: total }, (_, i) =>
      heights[i] && heights[i] > 0 ? heights[i] : FALLBACK_ITEM_HEIGHT,
    );
    return resolveBlockCollapseByHeight(list, budget, isCurrent, expanded);
  }, [total, heights, budget, isCurrent, expanded]);

  const firstVisibleIndex = total - collapse.visibleCount;

  const measureItem = useCallback(
    (index: number) => (node: HTMLDivElement | null) => {
      if (!node) return;
      const h = node.offsetHeight;
      if (h <= 0) return;
      const prev = heightsRef.current[index] ?? 0;
      if (Math.abs(prev - h) < 1) return;
      const next = heightsRef.current.slice();
      next[index] = h;
      heightsRef.current = next;
      setHeights(next);
    },
    [],
  );

  const toggleLabel =
    collapse.hiddenCount > 0
      ? locale === 'pt-BR'
        ? `Ver ${collapse.hiddenCount} ${collapse.hiddenCount === 1 ? 'mensagem anterior' : 'mensagens anteriores'}`
        : `Show ${collapse.hiddenCount} earlier ${collapse.hiddenCount === 1 ? 'message' : 'messages'}`
      : locale === 'pt-BR'
        ? 'Ver menos'
        : 'Show less';

  return (
    <div ref={containerRef} className={className}>
      {headerNodes.map((node, i) => (
        <Fragment key={`h-${i}`}>{node}</Fragment>
      ))}
      {collapse.showToggle && (
        <TimelineEventMarker
          label={toggleLabel}
          icon={collapse.hiddenCount > 0 ? <CaretDown /> : <CaretUp />}
          interactive
          onClick={() => setExpanded((v) => !v)}
          className="my-1"
        />
      )}
      {messageNodes.map((node, i) =>
        i >= firstVisibleIndex ? (
          <div key={i} ref={measureItem(i)}>
            {node}
          </div>
        ) : null,
      )}
    </div>
  );
}

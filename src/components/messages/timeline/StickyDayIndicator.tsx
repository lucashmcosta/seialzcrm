// Data "flutuante" no topo da conversa (como no WhatsApp): enquanto a pessoa rola,
// mostra o dia das mensagens que estão no topo. Lê os separadores de dia já renderizados
// (atributo data-day-separator) — não muda a lista nem os dados.
import { useEffect, useState, type RefObject } from 'react';
import { cn } from '@/lib/utils';

const TOP_OFFSET = 8; // px a partir do topo da área visível
const HIDE_NEAR = 36; // o separador real está chegando no topo: esconde o flutuante

export function StickyDayIndicator({ containerRef, deps = [] }: { containerRef: RefObject<HTMLElement>; deps?: unknown[] }) {
  const [label, setLabel] = useState<string | null>(null);
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const viewport = (root.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null) ?? root;
    let idle: ReturnType<typeof setTimeout> | null = null;
    let frame = 0;

    const compute = () => {
      frame = 0;
      const top = viewport.getBoundingClientRect().top + TOP_OFFSET;
      const seps = Array.from(viewport.querySelectorAll<HTMLElement>('[data-day-separator]'));
      let current: string | null = null;
      let nearTop = false;
      for (const el of seps) {
        const y = el.getBoundingClientRect().top;
        if (y <= top) current = el.dataset.daySeparator ?? null;
        else {
          if (y - top < HIDE_NEAR) nearTop = true;
          break;
        }
      }
      // No topo absoluto (primeiro separador visível) não há o que flutuar.
      setLabel(nearTop ? null : current);
    };

    const onScroll = () => {
      setScrolling(true);
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => setScrolling(false), 1500);
      if (!frame) frame = requestAnimationFrame(compute);
    };

    compute();
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      viewport.removeEventListener('scroll', onScroll);
      if (idle) clearTimeout(idle);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, ...deps]);

  if (!label) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center">
      <span
        aria-hidden="true"
        className={cn(
          'rounded-full border border-border/60 bg-background/95 px-3 py-1 text-[11px] font-medium text-muted-foreground',
          'shadow-[0_4px_12px_-4px_rgba(15,23,42,0.18)] backdrop-blur transition-opacity duration-300',
          scrolling ? 'opacity-100' : 'opacity-90',
        )}
      >
        {label}
      </span>
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';

// Representação visual do frozen_content congelado. Não altera snapshot/renderer.
// Página lógica fixa (legacy_template_816x1056) + escala visual para caber na largura.
const PAGE_W = 816;
const PAGE_H = 1056;
const PAD = 72; // margem interna da folha (px lógicos) [INCERTO: margem exata do renderer SuvSign]
const GAP = 16;

const clean = (html: string) => DOMPurify.sanitize(html ?? '');

export function FrozenDocumentPreview({ frozen, resetKey }: { frozen: any; resetKey: unknown }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [resetKey]);

  const margin = avail < 640 ? 12 : 28;
  const scale = avail ? Math.min(1, (avail - margin * 2) / PAGE_W) : 0;
  const pages: any[] = frozen?.pages ?? [];
  const hi = frozen?.headerImage;
  const hs = frozen?.headerSettings ?? {};
  const paper = { bg: hs.headerBgColor || '#ffffff', fg: hs.textColor || '#000000' };
  const justify = hi?.alignment === 'left' ? 'flex-start' : hi?.alignment === 'right' ? 'flex-end' : 'center';

  return (
    <div ref={scrollRef} className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide bg-muted" data-testid="a3-viewer">
      {scale > 0 && (
        <div style={{ padding: `${margin}px 0`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: GAP }}>
          {pages.map((p, i) => (
            <div key={p.id ?? i} style={{ width: PAGE_W * scale, height: PAGE_H * scale, flexShrink: 0 }} className="shadow-md border border-border">
              <div data-testid="a3-page"
                style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left', background: paper.bg, color: paper.fg,
                  padding: PAD, overflow: 'hidden', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 14, lineHeight: 1.5, boxSizing: 'border-box' }}>
                {hi?.src && (
                  <div style={{ display: 'flex', justifyContent: justify, marginBottom: 24 }}>
                    <img src={hi.src} alt="" style={{ width: hi.width || undefined, height: hi.height || undefined, objectFit: 'contain' }} />
                  </div>
                )}
                {(p.blocks ?? []).map((b: any, j: number) => {
                  if (b.type !== 'text' && b.type !== 'heading') return null;
                  const html = b.type === 'heading' ? `<strong>${b.content ?? ''}</strong>` : (b.content ?? '');
                  return <div key={b.id ?? j} style={{ whiteSpace: 'pre-wrap', marginBottom: 12, ...(b.blockStyle ?? {}) }} dangerouslySetInnerHTML={{ __html: clean(html) }} />;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

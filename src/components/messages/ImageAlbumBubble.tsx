import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export interface AlbumImage { id: string; url: string }

interface BubbleProps {
  images: AlbumImage[];
  onOpen: (index: number) => void;
  className?: string;
}

/** Grade 2×2 com "+N" na quarta foto, igual ao WhatsApp. */
export function ImageAlbumBubble({ images, onOpen, className }: BubbleProps) {
  const shown = images.slice(0, 4);
  const extra = images.length - 4;
  return (
    <div className={cn('grid grid-cols-2 gap-1 w-[244px]', className)} data-testid="image-album">
      {shown.map((img, i) => (
        <button
          key={img.id}
          type="button"
          onClick={() => onOpen(i)}
          className="relative aspect-square overflow-hidden rounded-[6px] bg-muted"
          aria-label={`Abrir foto ${i + 1} de ${images.length}`}
        >
          <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover hover:opacity-90" />
          {i === 3 && extra > 0 && (
            <span className="absolute inset-0 flex items-center justify-center bg-foreground/50 text-2xl font-semibold text-background">
              +{extra}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

interface ViewerProps {
  images: AlbumImage[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
  /** Ações extras para a foto aberta (ex.: vincular como documento). */
  renderActions?: (image: AlbumImage, index: number) => React.ReactNode;
}

/** Tela cheia com setas (e teclado) para passar entre as fotos do álbum. */
export function ImageAlbumViewer({ images, index, onIndexChange, renderActions }: ViewerProps) {
  const open = index !== null && images.length > 0;
  const go = useCallback((d: number) => {
    if (index === null) return;
    onIndexChange((index + d + images.length) % images.length);
  }, [index, images.length, onIndexChange]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, go]);

  const current = open ? images[index!] : null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onIndexChange(null)}>
      <DialogContent className="max-w-4xl p-2 bg-background">
        <DialogTitle className="sr-only">Fotos</DialogTitle>
        {current && (
          <div className="flex flex-col items-center gap-2">
            <div className="relative flex w-full items-center justify-center">
              <button type="button" onClick={() => go(-1)} aria-label="Foto anterior"
                className="absolute left-1 z-10 rounded-full bg-background/80 p-2 text-foreground hover:bg-background">
                <CaretLeft className="h-5 w-5" />
              </button>
              <img src={current.url} alt="" className="max-h-[75vh] max-w-full rounded-[6px] object-contain" />
              <button type="button" onClick={() => go(1)} aria-label="Próxima foto"
                className="absolute right-1 z-10 rounded-full bg-background/80 p-2 text-foreground hover:bg-background">
                <CaretRight className="h-5 w-5" />
              </button>
            </div>
            <div className="flex w-full items-center justify-between px-2 pb-1">
              <span className="text-sm text-muted-foreground">{index! + 1} de {images.length}</span>
              <div>{renderActions?.(current, index!)}</div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Estado do visualizador compartilhado pela tela. */
export function useAlbumViewer() {
  const [state, setState] = useState<{ images: AlbumImage[]; index: number } | null>(null);
  return {
    images: state?.images ?? [],
    index: state ? state.index : null,
    open: (images: AlbumImage[], index: number) => setState({ images, index }),
    setIndex: (i: number | null) => setState((s) => (i === null || !s ? null : { ...s, index: i })),
  };
}

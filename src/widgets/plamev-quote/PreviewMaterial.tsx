import type { ReactNode } from 'react';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface MaterialPreview { titulo: string; descricao: string; tipo: 'image' | 'document'; url: string }

/**
 * Prévia do material sem sair da tela: imagem inteira ou o PDF no leitor do navegador. `acoes` entra no rodapé
 * (ex.: "Enviar" no widget). No celular o leitor de PDF embutido pode mostrar só a 1ª página: "Abrir" resolve.
 */
export function PreviewMaterial({ material, onClose, acoes }: {
  material: MaterialPreview | null; onClose: () => void; acoes?: ReactNode;
}) {
  return (
    <Dialog open={!!material} onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <DialogContent size="xl" className="max-h-[92vh] grid-rows-[auto_1fr_auto]">
        {material && (
          <>
            <DialogHeader>
              <DialogTitle className="truncate pr-6">{material.titulo}</DialogTitle>
              {material.descricao && <DialogDescription>{material.descricao}</DialogDescription>}
            </DialogHeader>
            <div className="min-h-0 overflow-auto rounded-[6px] border border-border bg-muted/40">
              {material.tipo === 'image'
                ? <img src={material.url} alt={material.titulo} className="mx-auto max-h-[68vh] w-auto object-contain" />
                : <iframe src={`${material.url}#view=FitH`} title={material.titulo} className="h-[68vh] w-full" />}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="ghost" size="sm" asChild>
                <a href={material.url} target="_blank" rel="noopener noreferrer">
                  <ArrowSquareOut className="mr-1 h-4 w-4" /> Abrir em nova aba
                </a>
              </Button>
              {acoes && <div className="flex gap-2">{acoes}</div>}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CaretDown, Check, FileArrowDown, Image as ImageIcon, FileText, SpinnerGap, Plus, ArrowUp, ArrowDown, X } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useEntityDocuments, uploadErrorMessage, type DocType } from '@/hooks/documents/useEntityDocuments';
import { mediaUrlToFile } from '@/lib/mediaToFile';
import { mergeFilesToPdf, allMergeable, pageCountOf, MAX_PAGES } from '@/lib/pdfMerge';

export type AttachMedia = { url: string; mediaType?: string | null; fileName?: string | null; label?: string | null };
export type AttachOpportunity = { id: string; title?: string | null };

const mediaLabel = (m: AttachMedia) => m.label || m.fileName || (m.mediaType === 'image' ? 'Imagem recebida' : 'Documento recebido');

// Vincular mídia(s) recebida(s) na conversa como DOCUMENTO classificado. As PÁGINAS são
// controladas pelo pai (MessagesList): "Adicionar página" delega a seleção de volta à
// conversa (onde o atendente VÊ a foto). Junta várias fotos num só PDF (RG frente/verso).
export function AttachMediaDialog({
  open,
  onOpenChange,
  organizationId,
  contactId,
  contactName,
  opportunities,
  pages,
  onPagesChange,
  onPickMore,
  onAttached,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizationId: string;
  contactId: string;
  contactName?: string | null;
  opportunities: AttachOpportunity[];
  pages: AttachMedia[];
  onPagesChange: (p: AttachMedia[]) => void;
  onPickMore: () => void; // pai entra em "modo seleção" na conversa
  onAttached?: (info: { documentTypeId: string; ownerType: 'contact' | 'opportunity'; targetId: string }) => void;
}) {
  const [typeId, setTypeId] = useState<string>('');
  const [oppId, setOppId] = useState<string>(opportunities[0]?.id ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const contactDocs = useEntityDocuments('contact', contactId);
  const oppDocs = useEntityDocuments('opportunity', oppId || undefined);
  const types = contactDocs.types;

  const contactTypes = useMemo(() => types.filter((t) => t.owner_type === 'contact').sort((a, b) => a.name.localeCompare(b.name)), [types]);
  const opportunityTypes = useMemo(() => types.filter((t) => t.owner_type === 'opportunity').sort((a, b) => a.name.localeCompare(b.name)), [types]);

  const selectedType: DocType | undefined = types.find((t) => t.id === typeId);
  const owner = selectedType?.owner_type;
  const twoSides = !!selectedType?.has_two_sides;
  const needsOpp = owner === 'opportunity';
  const noOpps = needsOpp && opportunities.length === 0;

  const removePage = (i: number) => { if (pages.length > 1) onPagesChange(pages.filter((_, k) => k !== i)); };
  const movePage = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= pages.length) return;
    const next = [...pages]; [next[i], next[j]] = [next[j], next[i]]; onPagesChange(next);
  };

  const confirm = async () => {
    if (!selectedType || !owner) { toast.error('Escolha o tipo de documento.'); return; }
    if (needsOpp && !oppId) { toast.error('Escolha a oportunidade.'); return; }
    if (pages.length === 0) return;
    setSubmitting(true);
    try {
      const files = await Promise.all(
        pages.map((m) => mediaUrlToFile(m.url, { mediaType: m.mediaType, organizationId, fileName: m.fileName, label: selectedType.name })),
      );
      let file = files[0];
      if (files.length > 1) {
        if (!allMergeable(files)) throw new Error('Para juntar em 1 documento, use apenas imagens ou PDFs.');
        file = await mergeFilesToPdf(files, `${selectedType.name}.pdf`);
      }
      const isIncomplete = twoSides && (await pageCountOf(file)) < 2;
      const up = owner === 'opportunity' ? oppDocs.upload : contactDocs.upload;
      await up.mutateAsync({ file, documentTypeId: typeId, partyName: contactName, isIncomplete });
      toast.success(pages.length > 1 ? 'Documento vinculado (páginas unidas)' : 'Documento vinculado');
      onAttached?.({ documentTypeId: typeId, ownerType: owner, targetId: owner === 'opportunity' ? oppId : contactId });
      onOpenChange(false);
    } catch (e) {
      toast.error(uploadErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const MediaIcon = pages[0]?.mediaType === 'image' ? ImageIcon : FileText;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vincular como documento</DialogTitle>
          <DialogDescription>Classifique a mídia recebida e anexe ao contato ou à oportunidade.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Páginas do documento (frente e verso viram 1 PDF) */}
          <div className="space-y-1.5">
            <Label className="text-xs">Páginas ({pages.length})</Label>
            <div className="border rounded-md divide-y">
              {pages.map((p, i) => (
                <div key={p.url} className="flex items-center gap-2 p-2">
                  {p.mediaType === 'image' ? <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" /> : <FileText className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className="text-xs truncate flex-1">{i + 1}. {mediaLabel(p)}</span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={i === 0} onClick={() => movePage(i, -1)} title="Subir"><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={i === pages.length - 1} onClick={() => movePage(i, 1)} title="Descer"><ArrowDown className="h-3.5 w-3.5" /></Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={pages.length <= 1} onClick={() => removePage(i)} title="Remover"><X className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
            {/* Selecionar a próxima página OLHANDO a foto na conversa */}
            <Button type="button" variant="ghost" size="sm" className="h-7" onClick={onPickMore}>
              <Plus className="h-3.5 w-3.5 mr-1" />Adicionar página (escolher na conversa)
            </Button>
            {twoSides && (
              <p className="text-[11px] text-amber-600">Frente e verso viram 1 PDF — adicione as duas fotos. Até {MAX_PAGES} páginas.</p>
            )}
          </div>

          {/* Tipo */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de documento</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate">{selectedType ? selectedType.name : 'Escolher tipo...'}</span>
                  <CaretDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                <Command>
                  <CommandInput placeholder="Buscar tipo..." />
                  <CommandList className="max-h-60">
                    <CommandEmpty>Nenhum tipo habilitado.</CommandEmpty>
                    {contactTypes.length > 0 && (
                      <CommandGroup heading="Documentos do contato">
                        {contactTypes.map((t) => (
                          <CommandItem key={t.id} value={`${t.name} ${t.code}`} onSelect={() => { setTypeId(t.id); setPickerOpen(false); }}>
                            <Check className={`h-4 w-4 mr-2 ${typeId === t.id ? 'opacity-100' : 'opacity-0'}`} />
                            {t.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    {opportunityTypes.length > 0 && (
                      <CommandGroup heading="Documentos da oportunidade">
                        {opportunityTypes.map((t) => (
                          <CommandItem key={t.id} value={`${t.name} ${t.code}`} onSelect={() => { setTypeId(t.id); setPickerOpen(false); }}>
                            <Check className={`h-4 w-4 mr-2 ${typeId === t.id ? 'opacity-100' : 'opacity-0'}`} />
                            {t.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Destino */}
          {owner && (
            <div className="space-y-1.5">
              <Label className="text-xs">Destino</Label>
              {owner === 'contact' ? (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <Badge variant="secondary" className="text-[10px]">Contato</Badge>
                  <span className="truncate">{contactName || 'Contato'}</span>
                </div>
              ) : noOpps ? (
                <p className="text-xs text-amber-600">Este contato não tem oportunidades. Escolha um documento do contato ou crie uma oportunidade.</p>
              ) : (
                <Select value={oppId} onValueChange={setOppId}>
                  <SelectTrigger><SelectValue placeholder="Escolher oportunidade" /></SelectTrigger>
                  <SelectContent>
                    {opportunities.map((o) => <SelectItem key={o.id} value={o.id}>{o.title || 'Oportunidade'}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="ghost" size="sm" disabled={submitting}>Cancelar</Button></DialogClose>
          <Button type="button" size="sm" onClick={confirm} disabled={submitting || !selectedType || noOpps}>
            {submitting ? <SpinnerGap className="h-4 w-4 mr-1 animate-spin" /> : <FileArrowDown className="h-4 w-4 mr-1" />}
            Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

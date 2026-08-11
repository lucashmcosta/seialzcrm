import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CaretDown, Check, FileArrowDown, Image as ImageIcon, FileText, SpinnerGap } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useEntityDocuments, uploadErrorMessage, type DocType } from '@/hooks/documents/useEntityDocuments';
import { mediaUrlToFile } from '@/lib/mediaToFile';

export type AttachMedia = { url: string; mediaType?: string | null; fileName?: string | null };
export type AttachOpportunity = { id: string; title?: string | null };

// Vincular uma mídia recebida na conversa como DOCUMENTO classificado, reaproveitando o
// módulo de Documentos. O TIPO escolhido define o dono: tipo do contato → vincula ao
// contato; tipo da oportunidade → escolhe qual oportunidade. Sem tela nova.
export function AttachMediaDialog({
  open,
  onOpenChange,
  organizationId,
  contactId,
  contactName,
  opportunities,
  media,
  onAttached,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizationId: string;
  contactId: string;
  contactName?: string | null;
  opportunities: AttachOpportunity[];
  media: AttachMedia;
  onAttached?: (info: { documentTypeId: string; ownerType: 'contact' | 'opportunity'; targetId: string }) => void;
}) {
  const [typeId, setTypeId] = useState<string>('');
  const [oppId, setOppId] = useState<string>(opportunities[0]?.id ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Duas instâncias: types (catálogo habilitado, igual nas duas) + o upload de cada dono.
  const contactDocs = useEntityDocuments('contact', contactId);
  const oppDocs = useEntityDocuments('opportunity', oppId || undefined);
  const types = contactDocs.types;

  const contactTypes = useMemo(() => types.filter((t) => t.owner_type === 'contact').sort((a, b) => a.name.localeCompare(b.name)), [types]);
  const opportunityTypes = useMemo(() => types.filter((t) => t.owner_type === 'opportunity').sort((a, b) => a.name.localeCompare(b.name)), [types]);

  const selectedType: DocType | undefined = types.find((t) => t.id === typeId);
  const owner = selectedType?.owner_type;
  const needsOpp = owner === 'opportunity';
  const noOpps = needsOpp && opportunities.length === 0;

  const pick = (id: string) => { setTypeId(id); setPickerOpen(false); };
  const reset = () => { setTypeId(''); setPickerOpen(false); setSubmitting(false); };

  const confirm = async () => {
    if (!selectedType || !owner) { toast.error('Escolha o tipo de documento.'); return; }
    if (needsOpp && !oppId) { toast.error('Escolha a oportunidade.'); return; }
    setSubmitting(true);
    try {
      const file = await mediaUrlToFile(media.url, {
        mediaType: media.mediaType, organizationId, fileName: media.fileName, label: selectedType.name,
      });
      const up = owner === 'opportunity' ? oppDocs.upload : contactDocs.upload;
      await up.mutateAsync({ file, documentTypeId: typeId, partyName: contactName });
      toast.success('Documento vinculado');
      onAttached?.({ documentTypeId: typeId, ownerType: owner, targetId: owner === 'opportunity' ? oppId : contactId });
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(uploadErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const MediaIcon = media.mediaType === 'image' ? ImageIcon : FileText;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular como documento</DialogTitle>
          <DialogDescription>Classifique a mídia recebida e anexe ao contato ou à oportunidade.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mídia de origem */}
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2.5 text-sm">
            <MediaIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate">{media.fileName || (media.mediaType === 'image' ? 'Imagem recebida' : 'Documento recebido')}</span>
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
                          <CommandItem key={t.id} value={`${t.name} ${t.code}`} onSelect={() => pick(t.id)}>
                            <Check className={`h-4 w-4 mr-2 ${typeId === t.id ? 'opacity-100' : 'opacity-0'}`} />
                            {t.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    {opportunityTypes.length > 0 && (
                      <CommandGroup heading="Documentos da oportunidade">
                        {opportunityTypes.map((t) => (
                          <CommandItem key={t.id} value={`${t.name} ${t.code}`} onSelect={() => pick(t.id)}>
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

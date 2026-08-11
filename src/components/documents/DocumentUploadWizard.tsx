import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose,
} from '@/components/ui/dialog';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { UploadSimple, Check, CaretDown, ArrowUp, ArrowDown, X, SpinnerGap } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { uploadErrorMessage, type DocType } from '@/hooks/documents/useEntityDocuments';
import type { ReferenceInput } from '@/lib/documentName';
import { mergeFilesToPdf, allMergeable, MAX_PAGES } from '@/lib/pdfMerge';

const CATEGORY_LABELS: Record<string, string> = {
  IDENTIFICACAO: 'Identificação', ENDERECO: 'Endereço', REPRESENTACAO: 'Representação', TRIAGEM: 'Triagem',
  CONTRATACAO: 'Contratação', FINANCEIRO: 'Financeiro', PARCERIA: 'Parceria', VINCULO: 'Vínculo',
  REMUNERACAO: 'Remuneração', JORNADA: 'Jornada', RESCISAO: 'Rescisão', SAUDE: 'Saúde',
  PREVIDENCIARIO_FISCAL: 'Previdenciário / Fiscal', PARTE_CONTRARIA: 'Parte contrária', VIAGEM: 'Viagem',
  OCORRENCIA_VOO: 'Ocorrência de voo', DANOS_DESPESAS: 'Danos e despesas', ATENDIMENTO: 'Atendimento',
  PROVA: 'Prova', OUTROS: 'Outros',
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);
const FREE = '__free__';

export type WizardUploadInput = {
  file: File;
  documentTypeId?: string | null;
  reference?: ReferenceInput;
  partyName?: string | null;
  isIncomplete?: boolean;
};

export function DocumentUploadWizard({
  types,
  partyName,
  busy,
  onUpload,
}: {
  types: DocType[];
  partyName?: string | null;
  busy?: boolean;
  onUpload: (input: WizardUploadInput) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [typeId, setTypeId] = useState<string>(FREE);
  const [files, setFiles] = useState<File[]>([]);
  const [refDate, setRefDate] = useState('');
  const [refMonth, setRefMonth] = useState('');
  const [refEnd, setRefEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedType = typeId === FREE ? null : types.find((t) => t.id === typeId) ?? null;
  const refKind = selectedType?.reference_kind ?? 'none';
  const isMultiple = selectedType?.cardinality === 'multiple';
  const twoSides = !!selectedType?.has_two_sides;

  const groups = useMemo(() => {
    const byCat = new Map<string, DocType[]>();
    for (const t of types) {
      const cat = t.category_code || 'OUTROS';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(t);
    }
    return CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => ({
      code: c,
      label: CATEGORY_LABELS[c] ?? c,
      items: byCat.get(c)!.sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [types]);

  const reset = () => {
    setTypeId(FREE); setFiles([]); setRefDate(''); setRefMonth(''); setRefEnd(''); setPickerOpen(false); setSubmitting(false);
  };
  const pickType = (id: string) => { setTypeId(id); setPickerOpen(false); };
  const move = (i: number, dir: -1 | 1) => {
    setFiles((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const removeAt = (i: number) => setFiles((prev) => prev.filter((_, k) => k !== i));

  const hint = isMultiple
    ? 'Cada arquivo será enviado como um documento.'
    : twoSides
      ? `Frente e verso viram 1 PDF (2 páginas). Até ${MAX_PAGES}.`
      : `Vários arquivos viram 1 PDF (páginas), na ordem abaixo. Até ${MAX_PAGES}.`;

  const confirm = async () => {
    if (files.length === 0) return;
    const reference: ReferenceInput = { date: refDate || null, month: refMonth || null, endDate: refEnd || null };
    const documentTypeId = typeId === FREE ? null : typeId;
    setSubmitting(true);
    try {
      if (isMultiple) {
        for (const file of files) {
          await onUpload({ file, documentTypeId, reference, partyName });
        }
      } else {
        let file = files[0];
        if (files.length > 1) {
          if (!allMergeable(files)) throw new Error('Para juntar em 1 PDF, use apenas imagens ou PDFs.');
          const base = selectedType?.name || 'documento';
          file = await mergeFilesToPdf(files, `${base}.pdf`);
        }
        const isIncomplete = twoSides && files.length < 2;
        await onUpload({ file, documentTypeId, reference, partyName, isIncomplete });
      }
      toast.success(files.length > 1 && !isMultiple ? 'Documento enviado (páginas unidas)' : 'Documento enviado');
      setOpen(false);
      reset();
    } catch (e) {
      toast.error(uploadErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={busy}>
          <UploadSimple className="h-4 w-4 mr-1" /> Enviar documento
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar documento</DialogTitle>
          <DialogDescription>Escolha o tipo e os arquivos. Sem tipo = arquivo livre.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de documento</Label>
            <Button type="button" variant="outline" className="w-full justify-between font-normal" onClick={() => setPickerOpen((v) => !v)}>
              <span className="truncate">{selectedType ? selectedType.name : 'Sem tipo (arquivo livre)'}</span>
              <CaretDown className={`h-4 w-4 opacity-50 shrink-0 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
            </Button>
            {pickerOpen && (
              <Command className="rounded-md border">
                <CommandInput placeholder="Buscar tipo..." />
                <CommandList className="max-h-56">
                  <CommandEmpty>Nenhum tipo encontrado.</CommandEmpty>
                  <CommandGroup heading="Livre">
                    <CommandItem value="Sem tipo arquivo livre" onSelect={() => pickType(FREE)}>
                      <Check className={`h-4 w-4 mr-2 ${typeId === FREE ? 'opacity-100' : 'opacity-0'}`} />
                      Sem tipo (arquivo livre)
                    </CommandItem>
                  </CommandGroup>
                  {groups.map((g) => (
                    <CommandGroup key={g.code} heading={g.label}>
                      {g.items.map((t) => (
                        <CommandItem key={t.id} value={`${t.name} ${t.code}`} onSelect={() => pickType(t.id)}>
                          <Check className={`h-4 w-4 mr-2 ${typeId === t.id ? 'opacity-100' : 'opacity-0'}`} />
                          {t.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
            )}
          </div>

          {/* Referência condicional */}
          {refKind === 'date' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Data do documento</Label>
              <Input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} />
            </div>
          )}
          {refKind === 'month' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Competência (mês)</Label>
              <Input type="month" value={refMonth} onChange={(e) => setRefMonth(e.target.value)} />
            </div>
          )}
          {refKind === 'period' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Início</Label>
                <Input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fim</Label>
                <Input type="date" value={refEnd} onChange={(e) => setRefEnd(e.target.value)} />
              </div>
            </div>
          )}

          {/* Arquivos */}
          <div className="space-y-1.5">
            <Label className="text-xs">Arquivos</Label>
            <Input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            <p className="text-[11px] text-muted-foreground">{hint}</p>
            {files.length > 0 && (
              <div className="border rounded-lg divide-y mt-1">
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 p-2">
                    <span className="text-xs truncate flex-1">{isMultiple ? '' : `${i + 1}. `}{f.name}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {!isMultiple && (
                        <>
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={i === 0} onClick={() => move(i, -1)} title="Subir"><ArrowUp className="h-3.5 w-3.5" /></Button>
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={i === files.length - 1} onClick={() => move(i, 1)} title="Descer"><ArrowDown className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeAt(i)} title="Remover"><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm" disabled={submitting}>Cancelar</Button>
          </DialogClose>
          <Button type="button" size="sm" disabled={files.length === 0 || submitting || busy} onClick={confirm}>
            {submitting && <SpinnerGap className="h-4 w-4 mr-1 animate-spin" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

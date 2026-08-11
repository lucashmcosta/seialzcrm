import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose,
} from '@/components/ui/dialog';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { UploadSimple, Check, CaretDown } from '@phosphor-icons/react';
import type { DocType } from '@/hooks/documents/useEntityDocuments';
import type { ReferenceInput } from '@/lib/documentName';

// Rótulos/ordem dos blocos de categoria vivem em código (categoria é agrupamento visual).
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

export function DocumentUploadWizard({
  types,
  partyName,
  busy,
  onUpload,
}: {
  types: DocType[];
  partyName?: string | null;
  busy?: boolean;
  onUpload: (input: { file: File; documentTypeId?: string | null; reference?: ReferenceInput; partyName?: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [typeId, setTypeId] = useState<string>(FREE);
  const [file, setFile] = useState<File | null>(null);
  const [refDate, setRefDate] = useState('');
  const [refMonth, setRefMonth] = useState('');
  const [refEnd, setRefEnd] = useState('');

  const selectedType = typeId === FREE ? null : types.find((t) => t.id === typeId) ?? null;
  const refKind = selectedType?.reference_kind ?? 'none';

  // Agrupa os tipos por categoria, na ordem de CATEGORY_ORDER.
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

  const reset = () => { setTypeId(FREE); setFile(null); setRefDate(''); setRefMonth(''); setRefEnd(''); setPickerOpen(false); };

  const pickType = (id: string) => { setTypeId(id); setPickerOpen(false); };

  const confirm = () => {
    if (!file) return;
    const reference: ReferenceInput = { date: refDate || null, month: refMonth || null, endDate: refEnd || null };
    onUpload({ file, documentTypeId: typeId === FREE ? null : typeId, reference, partyName });
    setOpen(false);
    reset();
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
          <DialogDescription>Escolha o tipo e o arquivo. Sem tipo = arquivo livre.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo — botão que abre a lista inline (dentro do dialog) e FECHA ao selecionar. */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de documento</Label>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between font-normal"
              onClick={() => setPickerOpen((v) => !v)}
            >
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

          {/* Arquivo */}
          <div className="space-y-1.5">
            <Label className="text-xs">Arquivo</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm">Cancelar</Button>
          </DialogClose>
          <Button type="button" size="sm" disabled={!file || busy} onClick={confirm}>Enviar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CaretDown, Plus, TrashSimple } from '@phosphor-icons/react';
import { useState } from 'react';
import type { CatalogType } from '@/hooks/documents/useDocumentCatalog';
import { isRequiredGroup, type DocumentSet, type RequiredGroup, type RequiredItem, type WhenCondition } from '@/lib/documentRules';

// Campo personalizado como o editor precisa (com field_type + options).
export type EditorCustomField = { id: string; label: string; module: string; field_type: string; options: unknown };

// Opções {label,value} de um campo select/multiselect (custom_field_definitions.options).
function fieldOptions(f?: EditorCustomField): { label: string; value: string }[] {
  const raw = (f?.options as { options?: unknown } | null)?.options;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) => (o && typeof o === 'object' ? (o as { label?: unknown; value?: unknown }) : null))
    .filter((o): o is { label?: unknown; value?: unknown } => !!o && typeof o.value === 'string')
    .map((o) => ({ value: String(o.value), label: String(o.label ?? o.value) }));
}

// Nomes dos tipos escolhidos, na ordem de `codes`.
function namesOf(types: CatalogType[], codes: string[]): string[] {
  return codes.map((c) => types.find((t) => t.code === c)?.name).filter((n): n is string => !!n);
}

// Multi-seleção de tipos de documento (por CÓDIGO), em popover com busca.
function TypeMultiSelect({ types, selected, onChange, placeholder, joinWith = ', ' }: { types: CatalogType[]; selected: string[]; onChange: (codes: string[]) => void; placeholder?: string; joinWith?: string }) {
  const [open, setOpen] = useState(false);
  const toggle = (code: string) => onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  const text = selected.length ? namesOf(types, selected).join(joinWith) : (placeholder ?? 'Selecionar tipos...');
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-full justify-between font-normal">
          <span className="truncate">{text}</span>
          <CaretDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-72" align="start">
        <Command>
          <CommandInput placeholder="Buscar tipo..." />
          <CommandList className="max-h-56">
            <CommandEmpty>Nenhum tipo.</CommandEmpty>
            {types.map((t) => (
              <CommandItem key={t.id} value={`${t.name} ${t.code}`} onSelect={() => toggle(t.code)}>
                <Checkbox checked={selected.includes(t.code)} className="mr-2" />
                <span className="truncate">{t.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{t.owner_type === 'contact' ? 'contato' : 'oport.'}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Editor de exigências com alternativas (OU): rótulo + alternativas ligadas por "ou".
function GroupsEditor({ types, groups, onChange }: { types: CatalogType[]; groups: RequiredGroup[]; onChange: (g: RequiredGroup[]) => void }) {
  const set = (i: number, patch: Partial<RequiredGroup>) => onChange(groups.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  return (
    <div className="space-y-2">
      {groups.map((g, i) => {
        const names = namesOf(types, g.anyOf);
        return (
          <div key={i} className="rounded-md border p-3 space-y-2">
            <div className="flex gap-2">
              <Input placeholder='Nome da exigência (ex.: "Documento de identidade")' value={g.label ?? ''} onChange={(e) => set(i, { label: e.target.value })} />
              <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => onChange(groups.filter((_, idx) => idx !== i))}><TrashSimple className="h-4 w-4" /></Button>
            </div>
            <TypeMultiSelect types={types} selected={g.anyOf} onChange={(codes) => set(i, { anyOf: codes })} placeholder="Escolher documentos aceitos" joinWith=" ou " />
            {/* Expressão OU explícita. */}
            {names.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Basta enviar <span className="font-medium text-foreground">{names.join(' ou ')}</span>.
              </p>
            )}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...groups, { anyOf: [], label: '' }])}><Plus className="h-4 w-4 mr-1" />Adicionar exigência com alternativas (OU)</Button>
    </div>
  );
}

// Editor do exigido de um set condicional: códigos únicos + grupos anyOf.
function RequiredEditor({ types, value, onChange }: { types: CatalogType[]; value: RequiredItem[]; onChange: (v: RequiredItem[]) => void }) {
  const codes = value.filter((v): v is string => typeof v === 'string');
  const groups = value.filter(isRequiredGroup);
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <p className="text-[11px] text-muted-foreground">Exigir todos (E):</p>
        <TypeMultiSelect types={types} selected={codes} onChange={(c) => onChange([...c, ...groups])} placeholder="Documentos exigidos" />
      </div>
      <div className="space-y-1">
        <p className="text-[11px] text-muted-foreground">Com alternativas (OU) — basta um:</p>
        <GroupsEditor types={types} groups={groups} onChange={(g) => onChange([...codes, ...g])} />
      </div>
    </div>
  );
}

// Valor de uma condição: opções (select/multiselect) quando houver; senão texto.
function ValueEditor({ field, cond, onChange }: { field?: EditorCustomField; cond: WhenCondition; onChange: (v: string | string[]) => void }) {
  const opts = fieldOptions(field);
  if (cond.op === 'in') {
    const arr = Array.isArray(cond.value) ? cond.value : cond.value ? [cond.value] : [];
    if (opts.length) {
      const toggle = (v: string) => onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
      return (
        <div className="flex flex-wrap gap-2 rounded-md border p-2">
          {opts.map((o) => (
            <label key={o.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <Checkbox checked={arr.includes(o.value)} onCheckedChange={() => toggle(o.value)} />{o.label}
            </label>
          ))}
        </div>
      );
    }
    return <Input placeholder="valores separados por vírgula" value={arr.join(', ')} onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />;
  }
  const val = Array.isArray(cond.value) ? (cond.value[0] ?? '') : cond.value;
  if (opts.length) {
    return (
      <Select value={val || undefined} onValueChange={(v) => onChange(v)}>
        <SelectTrigger><SelectValue placeholder="valor" /></SelectTrigger>
        <SelectContent>{opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    );
  }
  return <Input placeholder="valor" value={val} onChange={(e) => onChange(e.target.value)} />;
}

// Editor das condições de um set (combinador todas/qualquer + linhas).
function ConditionsEditor({ customFields, when, onChange }: { customFields: EditorCustomField[]; when: DocumentSet['when']; onChange: (w: DocumentSet['when']) => void }) {
  const mode: 'all' | 'any' = when?.any?.length ? 'any' : 'all';
  const conds: WhenCondition[] = (mode === 'any' ? when?.any : when?.all) ?? [];
  const emit = (cs: WhenCondition[]) => onChange(mode === 'any' ? { any: cs } : { all: cs });
  const setCond = (i: number, patch: Partial<WhenCondition>) => emit(conds.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const addCond = () => emit([...conds, { field: customFields[0]?.id ?? '', op: 'eq', value: '' }]);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Aplica quando</span>
        <Select value={mode} onValueChange={(m: 'all' | 'any') => onChange(m === 'any' ? { any: conds } : { all: conds })}>
          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">E — todas</SelectItem><SelectItem value="any">OU — qualquer</SelectItem></SelectContent>
        </Select>
        <span className="text-muted-foreground">das condições:</span>
      </div>
      {conds.map((c, i) => {
        const field = customFields.find((f) => f.id === c.field);
        return (
          <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
            <Select value={c.field || undefined} onValueChange={(v) => setCond(i, { field: v, value: '' })}>
              <SelectTrigger className="h-8"><SelectValue placeholder="campo" /></SelectTrigger>
              <SelectContent>{customFields.map((f) => <SelectItem key={f.id} value={f.id}>{f.label} <span className="text-muted-foreground">({f.module === 'contacts' ? 'contato' : 'oport.'})</span></SelectItem>)}</SelectContent>
            </Select>
            <Select value={c.op} onValueChange={(op: 'eq' | 'in') => setCond(i, { op, value: op === 'in' ? [] : '' })}>
              <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="eq">é</SelectItem><SelectItem value="in">é um de</SelectItem></SelectContent>
            </Select>
            <ValueEditor field={field} cond={c} onChange={(v) => setCond(i, { value: v })} />
            <Button type="button" variant="ghost" size="icon" onClick={() => emit(conds.filter((_, idx) => idx !== i))}><TrashSimple className="h-4 w-4" /></Button>
          </div>
        );
      })}
      <Button type="button" variant="ghost" size="sm" onClick={addCond} disabled={customFields.length === 0}><Plus className="h-4 w-4 mr-1" />Condição</Button>
      {customFields.length === 0 && <p className="text-[11px] text-muted-foreground">Sem campos personalizados para condicionar. Crie um campo (select) em Configurações → Campos personalizados.</p>}
    </div>
  );
}

// Editor da lista de sets condicionais.
function ConditionalSetsEditor({ types, customFields, sets, onChange }: { types: CatalogType[]; customFields: EditorCustomField[]; sets: DocumentSet[]; onChange: (s: DocumentSet[]) => void }) {
  const setAt = (i: number, patch: Partial<DocumentSet>) => onChange(sets.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const add = () => onChange([...sets, { id: crypto.randomUUID(), priority: 0, when: { all: [] }, required: [] }]);
  return (
    <div className="space-y-3">
      {sets.map((s, i) => (
        <div key={s.id} className="rounded-md border p-3 space-y-3 bg-muted/20">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Prioridade</span>
              <Input type="number" className="h-8 w-20" value={s.priority} onChange={(e) => setAt(i, { priority: parseInt(e.target.value || '0', 10) })} />
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(sets.filter((_, idx) => idx !== i))}><TrashSimple className="h-4 w-4" /></Button>
          </div>
          <ConditionsEditor customFields={customFields} when={s.when} onChange={(w) => setAt(i, { when: w })} />
          <div>
            <p className="text-xs font-medium mb-1">Exige (quando a regra aplica):</p>
            <RequiredEditor types={types} value={s.required} onChange={(v) => setAt(i, { required: v })} />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" />Adicionar regra condicional</Button>
    </div>
  );
}

export function AdvancedDocumentRules({
  enabledTypes,
  customFields,
  groups,
  onGroupsChange,
  sets,
  onSetsChange,
}: {
  enabledTypes: CatalogType[];
  customFields: EditorCustomField[];
  groups: RequiredGroup[];
  onGroupsChange: (g: RequiredGroup[]) => void;
  sets: DocumentSet[];
  onSetsChange: (s: DocumentSet[]) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Regras avançadas de documentos</CardTitle>
        <CardDescription>Exigências com alternativas (ex.: identidade = RG <strong>ou</strong> CNH) e regras condicionais (E / OU) com prioridade. Opcional — a checklist acima continua valendo como base.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <div>
            <p className="text-sm font-medium">Documentos com alternativas (OU)</p>
            <p className="text-xs text-muted-foreground">Basta enviar <strong>um</strong> dos documentos aceitos. Ex.: <em>RG ou CNH</em>. As alternativas devem ser do mesmo dono (contato ou oportunidade).</p>
          </div>
          <GroupsEditor types={enabledTypes} groups={groups} onChange={onGroupsChange} />
        </section>
        <section className="space-y-2">
          <div>
            <p className="text-sm font-medium">Regras condicionais (E / OU)</p>
            <p className="text-xs text-muted-foreground">Exigências que valem só quando as condições batem. Maior prioridade vence; se nenhuma aplica, vale a base acima.</p>
          </div>
          <ConditionalSetsEditor types={enabledTypes} customFields={customFields} sets={sets} onChange={onSetsChange} />
        </section>
      </CardContent>
    </Card>
  );
}

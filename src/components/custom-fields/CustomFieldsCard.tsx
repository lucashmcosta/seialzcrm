import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { selectOptions, type FieldOption } from '@/lib/customFieldOptions';

type Module = 'contacts' | 'opportunities';
interface Def { id: string; name: string; label: string; field_type: string; is_required: boolean; options: unknown; order_index: number }
type Json = string | number | boolean | null;

const CLEAR = '__clear__';

// Campos personalizados da org para um contato ou uma oportunidade: ver e editar no lugar.
// Valor salvo em custom_field_values (RLS: membros da org). Lista guarda o "value" da opção.
// compact: coluna única sem moldura de Card (painel Atalhos do Comercial, 320px).
// bare (com compact): sem título — os campos aparecem junto dos dados fixos do registro.
export function CustomFieldsCard({ module, recordId, title = 'Campos personalizados', compact = false, bare = false }: { module: Module; recordId: string; title?: string; compact?: boolean; bare?: boolean }) {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const defs = useQuery({
    queryKey: ['custom-field-defs', orgId, module],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('custom_field_definitions')
        .select('id,name,label,field_type,is_required,options,order_index')
        .eq('organization_id', orgId!).eq('module', module).order('order_index');
      if (error) throw error;
      return (data ?? []) as Def[];
    },
  });

  const valuesKey = ['custom-field-values', module, recordId];
  const values = useQuery({
    queryKey: valuesKey,
    enabled: !!orgId && !!recordId,
    queryFn: async () => {
      const { data, error } = await supabase.from('custom_field_values')
        .select('field_definition_id,value').eq('module', module).eq('record_id', recordId);
      if (error) throw error;
      return new Map(((data ?? []) as { field_definition_id: string; value: Json }[]).map((r) => [r.field_definition_id, r.value]));
    },
  });

  const save = async (def: Def, value: Json) => {
    if (!orgId) return;
    const empty = value === null || value === '';
    const { error } = empty
      ? await supabase.from('custom_field_values').delete().eq('record_id', recordId).eq('field_definition_id', def.id)
      : await supabase.from('custom_field_values').upsert(
          { organization_id: orgId, module, record_id: recordId, field_definition_id: def.id, value, updated_at: new Date().toISOString() },
          { onConflict: 'record_id,field_definition_id' },
        );
    if (error) { toast.error(`Não foi possível salvar "${def.label}"`); return; }
    qc.invalidateQueries({ queryKey: valuesKey });
  };

  if (!defs.data?.length) return null;

  if (compact) {
    return (
      <section className="space-y-3">
        {!bare && <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>}
        {defs.data.map((def) => (
          <FieldEditor key={def.id} def={def} value={values.data?.get(def.id) ?? null} onSave={(v) => save(def, v)} />
        ))}
      </section>
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {defs.data.map((def) => (
          <FieldEditor key={def.id} def={def} value={values.data?.get(def.id) ?? null} onSave={(v) => save(def, v)} />
        ))}
      </CardContent>
    </Card>
  );
}

function FieldEditor({ def, value, onSave }: { def: Def; value: Json; onSave: (v: Json) => void }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  useEffect(() => { setDraft(value == null ? '' : String(value)); }, [value]);
  const id = `cf-${def.id}`;
  const label = <Label htmlFor={id} className="text-sm text-muted-foreground">{def.label}{def.is_required ? ' *' : ''}</Label>;
  const commit = (v: string) => { if (v !== (value == null ? '' : String(value))) onSave(v.trim() === '' ? null : v.trim()); };

  if (def.field_type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        {label}
        <Switch id={id} checked={value === true || value === 'true'} onCheckedChange={(c) => onSave(c)} />
      </div>
    );
  }
  if (def.field_type === 'select') {
    const opts: FieldOption[] = selectOptions(def.options);
    return (
      <div className="space-y-1.5">
        {label}
        <Select value={draft || undefined} onValueChange={(v) => onSave(v === CLEAR ? null : v)}>
          <SelectTrigger id={id}><SelectValue placeholder="Selecionar" /></SelectTrigger>
          <SelectContent>
            {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            {draft && <SelectItem value={CLEAR} className="text-muted-foreground">Limpar</SelectItem>}
          </SelectContent>
        </Select>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {label}
      <Input
        id={id}
        type={def.field_type === 'date' ? 'date' : def.field_type === 'number' ? 'number' : 'text'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
    </div>
  );
}

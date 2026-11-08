import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { callSignatureRequests } from '@/lib/signatureRequestsApi';
import { useDocumentCatalog } from '@/hooks/documents/useDocumentCatalog';
import { useOrganization } from '@/hooks/useOrganization';

const NONE = '__none__';

type T = { id: string; name: string; code?: string; is_enabled?: boolean };
// Tipos de contrato do catálogo aparecem primeiro, como sugestão (mesmo ainda não habilitados na org).
const isContractType = (t: T) => /contrat/i.test(`${t.code ?? ''} ${t.name}`) && !/social|trabalho|distrato/i.test(`${t.code ?? ''} ${t.name}`);
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function TypePicker({ value, suggested, contactTypes, oppTypes, onChange }: {
  value: string; suggested: T[]; contactTypes: T[]; oppTypes: T[]; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = value === NONE ? 'Escolher tipo de documento' : [...suggested, ...contactTypes, ...oppTypes].find((t) => t.id === value)?.name ?? 'Escolher tipo de documento';
  const pick = (v: string) => { setOpen(false); if (v !== value) onChange(v); };
  const item = (t: T) => (
    <CommandItem key={t.id} value={`${t.name} ${t.id}`} onSelect={() => pick(t.id)}>{t.name}</CommandItem>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-72 justify-between font-normal">
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command filter={(v, search) => (norm(v).includes(norm(search)) ? 1 : 0)}>
          <CommandInput placeholder="Buscar tipo..." />
          <CommandList>
            <CommandEmpty>Nenhum tipo encontrado</CommandEmpty>
            <CommandGroup>
              <CommandItem value="Sem tipo" onSelect={() => pick(NONE)}>Sem tipo (guarda no contato, sem tipo)</CommandItem>
            </CommandGroup>
            {suggested.length > 0 && <CommandGroup heading="Sugeridos (contratos)">{suggested.map(item)}</CommandGroup>}
            {contactTypes.length > 0 && <CommandGroup heading="Do contato">{contactTypes.map(item)}</CommandGroup>}
            {oppTypes.length > 0 && <CommandGroup heading="Da oportunidade">{oppTypes.map(item)}</CommandGroup>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Vínculo modelo SuvSign → Tipo de documento: o PDF assinado entra no CRM já com esse tipo.
export function SuvSignV2TemplateTypesCard({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const { userProfile } = useOrganization();
  const { catalog, setEnabled } = useDocumentCatalog();
  // Mostra o catálogo inteiro: escolher um tipo ainda não habilitado já o habilita na org.
  const types = catalog as unknown as (T & { owner_type: string })[];
  const templates = useQuery({
    queryKey: ['suvsign-v2-templates-admin', organizationId],
    queryFn: () => callSignatureRequests<{ templates: { id: string; name: string }[] }>('list_templates_admin', { organization_id: organizationId }),
    retry: false,
  });
  const mapKey = ['suvsign-v2-template-types', organizationId];
  const mappings = useQuery({
    queryKey: mapKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('suvsign_v2_template_document_types' as any)
        .select('template_id, document_type_id').eq('organization_id', organizationId);
      if (error) throw error;
      return new Map(((data ?? []) as any[]).map((r) => [r.template_id as string, r.document_type_id as string]));
    },
  });


  const change = async (tpl: { id: string; name: string }, value: string) => {
    const chosen = types.find((t) => t.id === value);
    if (chosen && !chosen.is_enabled) {
      try { await setEnabled.mutateAsync({ typeId: chosen.id, enabled: true }); }
      catch { toast.error('Não foi possível habilitar o tipo no catálogo de documentos'); return; }
    }
    const table = supabase.from('suvsign_v2_template_document_types' as any);
    const { error } = value === NONE
      ? await table.delete().eq('organization_id', organizationId).eq('template_id', tpl.id)
      : await table.upsert({
          organization_id: organizationId, template_id: tpl.id, template_name: tpl.name, document_type_id: value,
          created_by: userProfile?.id ?? null, updated_by: userProfile?.id ?? null,
        } as any, { onConflict: 'organization_id,template_id' });
    if (error) { toast.error('Não foi possível salvar'); return; }
    toast.success(chosen && !chosen.is_enabled ? `Tipo salvo e habilitado no catálogo: ${chosen.name}` : 'Tipo salvo');
    qc.invalidateQueries({ queryKey: mapKey });
  };

  const byEnabled = (a: T, b: T) => Number(!!b.is_enabled) - Number(!!a.is_enabled) || a.name.localeCompare(b.name, 'pt-BR');
  const suggested = types.filter(isContractType).sort(byEnabled);
  const contactTypes = types.filter((t) => t.owner_type === 'contact' && !isContractType(t)).sort(byEnabled);
  const oppTypes = types.filter((t) => t.owner_type === 'opportunity' && !isContractType(t)).sort(byEnabled);

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Onde cada contrato assinado é guardado</CardTitle>
        <CardDescription>
          Escolha o tipo de documento de cada modelo. Quando o contrato for assinado, ele entra na oportunidade com esse tipo e já conta nos documentos exigidos para fechar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {templates.isLoading && <p className="text-sm text-muted-foreground">Carregando modelos...</p>}
        {templates.error && <p className="text-sm text-muted-foreground">{(templates.error as Error).message}</p>}
        {templates.data?.templates.length === 0 && <p className="text-sm text-muted-foreground">Nenhum modelo encontrado na sua conta SuvSign. Crie um modelo lá e ele aparece aqui.</p>}
        {templates.data?.templates.map((tpl) => (
          <div key={tpl.id} className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
            <span className="text-sm">{tpl.name}</span>
            <TypePicker
              value={mappings.data?.get(tpl.id) ?? NONE}
              suggested={suggested}
              contactTypes={contactTypes}
              oppTypes={oppTypes}
              onChange={(v) => change(tpl, v)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

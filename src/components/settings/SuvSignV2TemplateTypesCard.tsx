import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { callSignatureRequests } from '@/lib/signatureRequestsApi';
import { useDocumentCatalog } from '@/hooks/documents/useDocumentCatalog';
import { useOrganization } from '@/hooks/useOrganization';

const NONE = '__none__';

// Vínculo modelo SuvSign → Tipo de documento: o PDF assinado entra no CRM já com esse tipo.
export function SuvSignV2TemplateTypesCard({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const { userProfile } = useOrganization();
  const { catalog } = useDocumentCatalog();
  const types = catalog.filter((t) => t.is_enabled);
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
    const table = supabase.from('suvsign_v2_template_document_types' as any);
    const { error } = value === NONE
      ? await table.delete().eq('organization_id', organizationId).eq('template_id', tpl.id)
      : await table.upsert({
          organization_id: organizationId, template_id: tpl.id, template_name: tpl.name, document_type_id: value,
          created_by: userProfile?.id ?? null, updated_by: userProfile?.id ?? null,
        } as any, { onConflict: 'organization_id,template_id' });
    if (error) { toast.error('Não foi possível salvar'); return; }
    toast.success('Tipo salvo');
    qc.invalidateQueries({ queryKey: mapKey });
  };

  const contactTypes = types.filter((t) => t.owner_type === 'contact');
  const oppTypes = types.filter((t) => t.owner_type === 'opportunity');

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Tipos de documento dos modelos</CardTitle>
        <CardDescription>
          Quando um documento deste modelo for assinado, ele entra no CRM com o tipo escolhido e conta para os documentos exigidos para fechar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {templates.isLoading && <p className="text-sm text-muted-foreground">Carregando modelos...</p>}
        {templates.error && <p className="text-sm text-muted-foreground">{(templates.error as Error).message}</p>}
        {templates.data?.templates.length === 0 && <p className="text-sm text-muted-foreground">Nenhum modelo na conta SuvSign.</p>}
        {templates.data?.templates.map((tpl) => (
          <div key={tpl.id} className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
            <span className="text-sm">{tpl.name}</span>
            <Select value={mappings.data?.get(tpl.id) ?? NONE} onValueChange={(v) => change(tpl, v)}>
              <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem tipo</SelectItem>
                {contactTypes.length > 0 && (
                  <SelectGroup><SelectLabel>Do contato</SelectLabel>
                    {contactTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectGroup>
                )}
                {oppTypes.length > 0 && (
                  <SelectGroup><SelectLabel>Da oportunidade</SelectLabel>
                    {oppTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

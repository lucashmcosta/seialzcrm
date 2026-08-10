import { useEffect, useState } from 'react';
import { FloppyDisk, Info, SpinnerGap } from '@phosphor-icons/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from '@/hooks/use-toast';
import type { ClosePolicyMode } from '@/lib/opportunityClose';
import { buildDocumentRules, requiredTypeIds } from '@/lib/documentRules';

type Policy = {
  mode: ClosePolicyMode;
  require_cpf_verified: boolean;
  require_complete_address: boolean;
  required_contact_fields: string[];
  required_opportunity_fields: string[];
  required_contact_custom_field_ids: string[];
  required_opportunity_custom_field_ids: string[];
};

const empty: Policy = { mode: 'off', require_cpf_verified: false, require_complete_address: false, required_contact_fields: [], required_opportunity_fields: [], required_contact_custom_field_ids: [], required_opportunity_custom_field_ids: [] };
const contactFields = [{ id: 'email', label: 'E-mail' }, { id: 'phone', label: 'Telefone' }, { id: 'rg', label: 'RG' }, { id: 'nationality', label: 'Nacionalidade' }];
const opportunityFields = [{ id: 'title', label: 'Título' }, { id: 'amount', label: 'Valor' }, { id: 'source', label: 'Origem' }, { id: 'owner_user_id', label: 'Responsável' }];

export function OpportunityCloseSettings() {
  const { organization } = useOrganization();
  const [policy, setPolicy] = useState<Policy>(empty);
  const [customFields, setCustomFields] = useState<Array<{ id: string; label: string; module: string }>>([]);
  const [docTypes, setDocTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [reqDocIds, setReqDocIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isBrazil = organization?.operating_country_code === 'BR';

  useEffect(() => {
    if (!organization?.id) return;
    setLoading(true);
    Promise.all([
      supabase.from('opportunity_close_policies').select('*').eq('organization_id', organization.id).maybeSingle(),
      supabase.from('custom_field_definitions').select('id,label,module').eq('organization_id', organization.id).order('order_index'),
      supabase.from('document_types').select('id,name').eq('organization_id', organization.id).eq('is_active', true).is('deleted_at', null).order('sort_order').order('name'),
    ]).then(([policyResult, fieldsResult, typesResult]) => {
      if (policyResult.data) setPolicy({ ...empty, ...(policyResult.data as unknown as Policy) });
      else setPolicy(empty);
      setReqDocIds(requiredTypeIds((policyResult.data as { document_rules?: unknown } | null)?.document_rules));
      setCustomFields((fieldsResult.data || []) as Array<{ id: string; label: string; module: string }>);
      setDocTypes((typesResult.data || []) as Array<{ id: string; name: string }>);
    }).finally(() => setLoading(false));
  }, [organization?.id]);

  const toggleArray = (key: keyof Policy, value: string, checked: boolean) => setPolicy((current) => ({ ...current, [key]: checked ? [...(current[key] as string[]), value] : (current[key] as string[]).filter((item) => item !== value) }));

  const save = async () => {
    if (!organization?.id) return;
    setSaving(true);
    const payload = isBrazil ? policy : { ...policy, require_cpf_verified: false, require_complete_address: false };
    const { error } = await supabase.from('opportunity_close_policies').upsert({ organization_id: organization.id, ...payload, document_rules: buildDocumentRules(reqDocIds) }, { onConflict: 'organization_id' });
    setSaving(false);
    toast(error ? { title: 'Não foi possível salvar', description: error.message, variant: 'destructive' } : { title: 'Regras de fechamento salvas' });
  };

  if (loading) return <div className="flex justify-center py-12"><SpinnerGap className="h-6 w-6 animate-spin" /></div>;
  const renderField = (id: string, label: string, key: keyof Policy) => <label key={id} className="flex items-center gap-3 rounded-md border p-3 text-sm"><Checkbox checked={(policy[key] as string[]).includes(id)} onCheckedChange={(checked) => toggleArray(key, id, checked === true)} /><span>{label}</span></label>;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <Card><CardHeader><CardTitle>Regras de fechamento</CardTitle><CardDescription>Defina os dados necessários para mover uma oportunidade para Ganho nesta organização.</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="space-y-2"><Label>Modo de execução</Label><Select value={policy.mode} onValueChange={(mode: ClosePolicyMode) => setPolicy({ ...policy, mode })}><SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="off">Desligado</SelectItem><SelectItem value="monitor">Monitorar sem bloquear</SelectItem><SelectItem value="enforce">Aplicar e bloquear</SelectItem></SelectContent></Select></div>
        {policy.mode === 'monitor' && <Alert><Info /><AlertTitle>Monitoramento seguro</AlertTitle><AlertDescription>As pendências serão exibidas e auditadas, mas o ganho continuará permitido.</AlertDescription></Alert>}
        {policy.mode === 'enforce' && <Alert variant="destructive"><Info /><AlertTitle>Bloqueio ativo</AlertTitle><AlertDescription>Oportunidades incompletas não poderão ser ganhas nem gerar o evento para integrações.</AlertDescription></Alert>}
        {!isBrazil && <Alert><Info /><AlertTitle>Regras brasileiras indisponíveis</AlertTitle><AlertDescription>CPF e endereço BR só podem ser exigidos em organizações cujo país operacional seja Brasil.</AlertDescription></Alert>}
        <div className="flex items-center justify-between rounded-lg border p-4"><div><Label>CPF encontrado pela API</Label><p className="text-xs text-muted-foreground">A validação matemática isolada não atende esta regra.</p></div><Switch disabled={!isBrazil} checked={isBrazil && policy.require_cpf_verified} onCheckedChange={(value) => setPolicy({ ...policy, require_cpf_verified: value })} /></div>
        <div className="flex items-center justify-between rounded-lg border p-4"><div><Label>Endereço BR completo</Label><p className="text-xs text-muted-foreground">CEP, logradouro, número, bairro, cidade e UF. Complemento é opcional.</p></div><Switch disabled={!isBrazil} checked={isBrazil && policy.require_complete_address} onCheckedChange={(value) => setPolicy({ ...policy, require_complete_address: value })} /></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Campos nativos obrigatórios</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><p className="text-sm font-medium">Contato</p>{contactFields.map((field) => renderField(field.id, field.label, 'required_contact_fields'))}</div><div className="space-y-2"><p className="text-sm font-medium">Oportunidade</p>{opportunityFields.map((field) => renderField(field.id, field.label, 'required_opportunity_fields'))}</div></CardContent></Card>
      {customFields.length > 0 && <Card><CardHeader><CardTitle className="text-base">Campos personalizados obrigatórios</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{customFields.map((field) => renderField(field.id, field.label, field.module === 'contacts' ? 'required_contact_custom_field_ids' : 'required_opportunity_custom_field_ids'))}</CardContent></Card>}
      {docTypes.length > 0 && <Card><CardHeader><CardTitle className="text-base">Documentos obrigatórios para fechar</CardTitle><CardDescription>Tipos de documento que precisam existir no contato para ganhar a oportunidade.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{docTypes.map((t) => <label key={t.id} className="flex items-center gap-3 rounded-md border p-3 text-sm"><Checkbox checked={reqDocIds.includes(t.id)} onCheckedChange={(checked) => setReqDocIds((cur) => (checked === true ? [...cur, t.id] : cur.filter((x) => x !== t.id)))} /><span>{t.name}</span></label>)}</CardContent></Card>}
      <Button onClick={save} disabled={saving}>{saving ? <SpinnerGap className="mr-2 animate-spin" /> : <FloppyDisk className="mr-2" />}Salvar regras</Button>
    </div>
  );
}

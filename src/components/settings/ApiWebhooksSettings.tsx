import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuth } from '@/hooks/useAuth';
import { Key, Copy, Plus, TrashSimple, Eye, EyeSlash, ArrowsLeftRight, WarningCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';

// Grouped scopes for the UI
const SCOPE_GROUPS = [
  {
    entity: 'Contatos',
    scopes: [
      { id: 'contacts:read', label: 'Leitura', description: 'Ler contatos via GET' },
      { id: 'contacts:write', label: 'Escrita', description: 'Criar/atualizar contatos via POST' },
    ],
  },
  {
    entity: 'Oportunidades',
    scopes: [
      { id: 'opportunities:read', label: 'Leitura', description: 'Ler oportunidades via GET' },
      { id: 'opportunities:write', label: 'Escrita', description: 'Criar oportunidades via POST' },
    ],
  },
  {
    entity: 'Atividades',
    scopes: [
      { id: 'activities:read', label: 'Leitura', description: 'Ler atividades via GET' },
      { id: 'activities:write', label: 'Escrita', description: 'Criar notas/atividades via POST' },
    ],
  },
];

// Keep flat list for backward compat
const ALL_SCOPE_IDS = SCOPE_GROUPS.flatMap(g => g.scopes.map(s => s.id));

const INTERNAL_FIELDS: Record<string, { value: string; label: string }[]> = {
  contact: [
    { value: 'full_name', label: 'Nome completo' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Telefone' },
    { value: 'company_name', label: 'Empresa' },
    { value: 'source', label: 'Origem' },
    { value: 'utm_source', label: 'UTM Source' },
    { value: 'utm_medium', label: 'UTM Medium' },
    { value: 'utm_campaign', label: 'UTM Campaign' },
    { value: 'notes', label: 'Notas (cria atividade)' },
  ],
  opportunity: [
    { value: 'title', label: 'Título' },
    { value: 'amount', label: 'Valor' },
    { value: 'source', label: 'Origem' },
  ],
};

const TRANSFORM_OPTIONS = [
  { value: 'direct', label: 'Direto' },
  { value: 'phone_e164', label: 'Telefone E.164' },
  { value: 'lowercase', label: 'Minúsculas' },
  { value: 'uppercase', label: 'Maiúsculas' },
];

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'crm_live_';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

interface FieldMapping {
  id?: string;
  external_field: string;
  internal_field: string;
  is_required: boolean;
  default_value: string;
  transform_type: string;
}

export function ApiWebhooksSettings() {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [createKeyDialogOpen, setCreateKeyDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['contacts:write']);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [deleteKeyConfirmOpen, setDeleteKeyConfirmOpen] = useState(false);
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);

  // Field mapping state
  const [mappingEntityType, setMappingEntityType] = useState<string>('contact');
  const [mappingDirection, setMappingDirection] = useState<string>('inbound');
  const [newMapping, setNewMapping] = useState<FieldMapping>({
    external_field: '',
    internal_field: '',
    is_required: false,
    default_value: '',
    transform_type: 'direct',
  });

  const webhookUrl = 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/lead-webhook';

  const { data: apiKeys, isLoading: loadingApiKeys } = useQuery({
    queryKey: ['organization-api-keys', organization?.id],
    queryFn: async () => {
      if (!organization) return [];
      const { data, error } = await supabase
        .from('organization_api_keys')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organization,
  });

  // Field mappings query
  const { data: fieldMappings, isLoading: loadingMappings } = useQuery({
    queryKey: ['webhook-field-mappings', organization?.id, mappingDirection, mappingEntityType],
    queryFn: async () => {
      if (!organization) return [];
      const { data, error } = await supabase
        .from('webhook_field_mappings')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('direction', mappingDirection)
        .eq('entity_type', mappingEntityType)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!organization,
  });

  const createApiKeyMutation = useMutation({
    mutationFn: async ({ name, scopes }: { name: string; scopes: string[] }) => {
      if (!organization || !user) throw new Error('Organization or user not found');
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();
      if (userError) throw userError;

      const apiKey = generateApiKey();
      const { error } = await supabase
        .from('organization_api_keys')
        .insert({
          organization_id: organization.id,
          name: name || 'Default API Key',
          api_key: apiKey,
          scopes: scopes,
          created_by_user_id: userData.id,
        });
      if (error) throw error;
      return apiKey;
    },
    onSuccess: (apiKey) => {
      toast.success('API Key criada! Copie a chave agora.');
      navigator.clipboard.writeText(apiKey);
      queryClient.invalidateQueries({ queryKey: ['organization-api-keys'] });
      setCreateKeyDialogOpen(false);
      setNewKeyName('');
      setNewKeyScopes(['contacts:write']);
    },
    onError: (error: any) => {
      toast.error(`Erro ao criar API Key: ${error.message}`);
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await supabase.from('organization_api_keys').delete().eq('id', keyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('API Key excluída!');
      queryClient.invalidateQueries({ queryKey: ['organization-api-keys'] });
    },
    onError: (error: any) => {
      toast.error(`Erro ao excluir API Key: ${error.message}`);
    },
  });

  const toggleApiKeyMutation = useMutation({
    mutationFn: async ({ keyId, isActive }: { keyId: string; isActive: boolean }) => {
      const { error } = await supabase.from('organization_api_keys').update({ is_active: isActive }).eq('id', keyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Status da API Key atualizado!');
      queryClient.invalidateQueries({ queryKey: ['organization-api-keys'] });
    },
    onError: (error: any) => {
      toast.error(`Erro ao atualizar API Key: ${error.message}`);
    },
  });

  // Field mapping mutations
  const addMappingMutation = useMutation({
    mutationFn: async (mapping: FieldMapping) => {
      if (!organization) throw new Error('No organization');
      const { error } = await supabase.from('webhook_field_mappings').insert({
        organization_id: organization.id,
        direction: mappingDirection,
        entity_type: mappingEntityType,
        external_field: mapping.external_field,
        internal_field: mapping.internal_field,
        is_required: mapping.is_required,
        default_value: mapping.default_value || null,
        transform_type: mapping.transform_type,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Mapeamento adicionado!');
      queryClient.invalidateQueries({ queryKey: ['webhook-field-mappings'] });
      setNewMapping({ external_field: '', internal_field: '', is_required: false, default_value: '', transform_type: 'direct' });
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const deleteMappingMutation = useMutation({
    mutationFn: async (mappingId: string) => {
      const { error } = await supabase.from('webhook_field_mappings').delete().eq('id', mappingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Mapeamento removido!');
      queryClient.invalidateQueries({ queryKey: ['webhook-field-mappings'] });
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(keyId)) newSet.delete(keyId);
      else newSet.add(keyId);
      return newSet;
    });
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 12) return key;
    return key.substring(0, 12) + '•'.repeat(20) + key.substring(key.length - 4);
  };

  const handleDeleteKeyClick = (keyId: string) => {
    setDeletingKeyId(keyId);
    setDeleteKeyConfirmOpen(true);
  };

  const handleDeleteKeyConfirm = () => {
    if (deletingKeyId) deleteApiKeyMutation.mutate(deletingKeyId);
    setDeleteKeyConfirmOpen(false);
    setDeletingKeyId(null);
  };

  // Build scope display labels
  const getScopeLabel = (scopeId: string) => {
    for (const group of SCOPE_GROUPS) {
      const scope = group.scopes.find(s => s.id === scopeId);
      if (scope) return `${group.entity}: ${scope.label}`;
    }
    if (scopeId === 'leads:write') return 'Leads: Escrita (legado)';
    return scopeId;
  };

  // Dynamic documentation: build example based on mappings and selected key scopes
  const hasWriteScopes = apiKeys?.some((k: any) => k.is_active && (k.scopes?.some((s: string) => s.endsWith(':write'))));
  const hasReadScopes = apiKeys?.some((k: any) => k.is_active && (k.scopes?.some((s: string) => s.endsWith(':read'))));

  const buildPostExample = () => {
    if (!fieldMappings || fieldMappings.length === 0) {
      return `{
    name: "João Silva",           // obrigatório
    email: "joao@email.com",      // opcional
    phone: "+5511999999999",      // opcional
    company: "Empresa LTDA",      // opcional
    source: "landing_page",       // opcional
    notes: "Observações...",      // opcional
    create_opportunity: true,     // opcional
    opportunity_title: "Lead FB", // opcional
    opportunity_value: 5000       // opcional
  }`;
    }

    const lines = fieldMappings.map((m: any) => {
      const req = m.is_required ? '// obrigatório' : '// opcional';
      const def = m.default_value ? ` (padrão: ${m.default_value})` : '';
      return `    "${m.external_field}": "valor"${fieldMappings.indexOf(m) < fieldMappings.length - 1 ? ',' : ''} ${req}${def}`;
    });

    return `{\n${lines.join('\n')}\n  }`;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API & Webhooks
          </CardTitle>
          <CardDescription>
            Receba e envie dados de/para sistemas externos via API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Webhook URL */}
          <div className="space-y-2">
            <Label>URL do Webhook</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl, 'URL do Webhook')}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Use esta URL para enviar e receber dados de sistemas externos (formulários, ERPs, assinatura de contratos, etc.)
            </p>
          </div>

          {/* API Keys */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>API Keys</Label>
              <Dialog open={createKeyDialogOpen} onOpenChange={setCreateKeyDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Nova API Key
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Criar Nova API Key</DialogTitle>
                    <DialogDescription>
                      Defina o nome e as permissões desta chave de API.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="keyName">Nome da Key</Label>
                      <Input
                        id="keyName"
                        placeholder="Ex: Sistema de Assinatura"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-3">
                      <Label>Permissões</Label>
                      {SCOPE_GROUPS.map((group) => (
                        <div key={group.entity} className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">{group.entity}</p>
                          <div className="grid grid-cols-2 gap-2 pl-2">
                            {group.scopes.map((scope) => (
                              <div key={scope.id} className="flex items-center gap-2">
                                <Checkbox
                                  id={scope.id}
                                  checked={newKeyScopes.includes(scope.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setNewKeyScopes([...newKeyScopes, scope.id]);
                                    } else {
                                      setNewKeyScopes(newKeyScopes.filter(s => s !== scope.id));
                                    }
                                  }}
                                />
                                <label htmlFor={scope.id} className="text-sm">
                                  {scope.label}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateKeyDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => createApiKeyMutation.mutate({ name: newKeyName, scopes: newKeyScopes })}
                      disabled={createApiKeyMutation.isPending || newKeyScopes.length === 0}
                    >
                      {createApiKeyMutation.isPending ? 'Criando...' : 'Criar API Key'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {loadingApiKeys ? (
              <p className="text-sm text-muted-foreground">Carregando API Keys...</p>
            ) : apiKeys && apiKeys.length > 0 ? (
              <div className="space-y-3">
                {apiKeys.map((key: any) => (
                  <div key={key.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{key.name}</span>
                        <Badge variant={key.is_active ? 'default' : 'secondary'}>
                          {key.is_active ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-sm font-mono text-muted-foreground">
                          {visibleKeys.has(key.id) ? key.api_key : maskApiKey(key.api_key)}
                        </code>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleKeyVisibility(key.id)}>
                          {visibleKeys.has(key.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {key.scopes?.map((s: string) => (
                          <Badge key={s} variant="outline" className="text-xs">{getScopeLabel(s)}</Badge>
                        ))}
                        {key.last_used_at && (
                          <span className="text-xs text-muted-foreground ml-1">
                            • Último uso: {new Date(key.last_used_at).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(key.api_key, 'API Key')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => toggleApiKeyMutation.mutate({ keyId: key.id, isActive: !key.is_active })}>
                        {key.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteKeyClick(key.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma API Key criada ainda.
              </p>
            )}
          </div>

          {/* Field Mapping Section */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              <Label className="text-base font-semibold">Field Mapping</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Mapeie os campos que sistemas externos enviam para os campos internos do CRM. Quando um webhook chegar, os campos serão traduzidos automaticamente.
            </p>

            <div className="flex gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Direção</Label>
                <Select value={mappingDirection} onValueChange={setMappingDirection}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inbound">Entrada</SelectItem>
                    <SelectItem value="outbound">Saída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Entidade</Label>
                <Select value={mappingEntityType} onValueChange={setMappingEntityType}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contact">Contato</SelectItem>
                    <SelectItem value="opportunity">Oportunidade</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Existing mappings */}
            {loadingMappings ? (
              <p className="text-sm text-muted-foreground">Carregando mapeamentos...</p>
            ) : fieldMappings && fieldMappings.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2 font-medium">Campo Externo</th>
                      <th className="text-left p-2 font-medium">→</th>
                      <th className="text-left p-2 font-medium">Campo Interno</th>
                      <th className="text-left p-2 font-medium">Transf.</th>
                      <th className="text-left p-2 font-medium">Obrig.</th>
                      <th className="text-left p-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fieldMappings.map((m: any) => (
                      <tr key={m.id} className="border-t">
                        <td className="p-2 font-mono text-xs">{m.external_field}</td>
                        <td className="p-2 text-muted-foreground">→</td>
                        <td className="p-2 font-mono text-xs">{m.internal_field}</td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-xs">{m.transform_type}</Badge>
                        </td>
                        <td className="p-2">
                          {m.is_required && <Badge variant="destructive" className="text-xs">Sim</Badge>}
                        </td>
                        <td className="p-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => deleteMappingMutation.mutate(m.id)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="border border-dashed rounded-lg p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Nenhum mapeamento configurado. Sem mapeamento, o webhook aceita os campos padrão (name, email, phone, etc.)
                </p>
              </div>
            )}

            {/* Add new mapping */}
            <div className="flex flex-wrap items-end gap-2 p-3 border rounded-lg bg-muted/30">
              <div className="space-y-1">
                <Label className="text-xs">Campo Externo</Label>
                <Input
                  placeholder="Ex: signerName"
                  className="w-[150px] h-9 text-sm"
                  value={newMapping.external_field}
                  onChange={(e) => setNewMapping({ ...newMapping, external_field: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Campo Interno</Label>
                <Select
                  value={newMapping.internal_field}
                  onValueChange={(v) => setNewMapping({ ...newMapping, internal_field: v })}
                >
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(INTERNAL_FIELDS[mappingEntityType] || []).map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Transformação</Label>
                <Select
                  value={newMapping.transform_type}
                  onValueChange={(v) => setNewMapping({ ...newMapping, transform_type: v })}
                >
                  <SelectTrigger className="w-[130px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSFORM_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Padrão</Label>
                <Input
                  placeholder="Valor padrão"
                  className="w-[120px] h-9 text-sm"
                  value={newMapping.default_value}
                  onChange={(e) => setNewMapping({ ...newMapping, default_value: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 h-9">
                <Checkbox
                  id="mapping-required"
                  checked={newMapping.is_required}
                  onCheckedChange={(checked) => setNewMapping({ ...newMapping, is_required: !!checked })}
                />
                <label htmlFor="mapping-required" className="text-xs">Obrigatório</label>
              </div>
              <Button
                size="sm"
                className="h-9"
                disabled={!newMapping.external_field || !newMapping.internal_field || addMappingMutation.isPending}
                onClick={() => addMappingMutation.mutate(newMapping)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Adicionar
              </Button>
            </div>
          </div>

          {/* Dynamic Documentation */}
          <div className="space-y-3 pt-4 border-t">
            <Label>Como usar</Label>
            <div className="bg-muted rounded-lg p-4 space-y-4">
              {/* POST example */}
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Enviar dados (POST) — requer escopo <code className="bg-background px-1 py-0.5 rounded text-xs">contacts:write</code> ou <code className="bg-background px-1 py-0.5 rounded text-xs">leads:write</code>
                </p>
                <pre className="bg-background rounded p-3 overflow-x-auto text-xs">
{`fetch("${webhookUrl}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "SUA_API_KEY"
  },
  body: JSON.stringify(${buildPostExample()})
});`}
                </pre>
              </div>

              {/* GET example */}
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Ler dados (GET) — requer escopo <code className="bg-background px-1 py-0.5 rounded text-xs">contacts:read</code> ou <code className="bg-background px-1 py-0.5 rounded text-xs">opportunities:read</code>
                </p>
                <pre className="bg-background rounded p-3 overflow-x-auto text-xs">
{`fetch("${webhookUrl}?entity=contacts&limit=50", {
  method: "GET",
  headers: {
    "x-api-key": "SUA_API_KEY"
  }
});`}
                </pre>
              </div>

              <p className="text-sm text-muted-foreground">
                <strong>Resposta de sucesso (201):</strong>
              </p>
              <pre className="bg-background rounded p-3 overflow-x-auto text-xs">
{`{
  "success": true,
  "contact_id": "uuid",
  "opportunity_id": "uuid",
  "activity_id": "uuid",
  "message": "Lead created successfully"
}`}
              </pre>

              {fieldMappings && fieldMappings.length > 0 && (
                <div className="flex items-start gap-2 p-3 border rounded-lg bg-background">
                  <AlertCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    <strong>Field Mapping ativo:</strong> Os campos do payload serão traduzidos automaticamente conforme os mapeamentos configurados acima.
                    Campos não mapeados serão ignorados. Se não houver mapeamento, os campos padrão (name, email, phone, etc.) são aceitos normalmente.
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteKeyConfirmOpen}
        onOpenChange={setDeleteKeyConfirmOpen}
        title="Excluir API Key"
        description="Tem certeza que deseja excluir esta API Key? Integrações que usam esta chave deixarão de funcionar imediatamente."
        confirmText="Excluir"
        variant="destructive"
        onConfirm={handleDeleteKeyConfirm}
        loading={deleteApiKeyMutation.isPending}
      />
    </>
  );
}

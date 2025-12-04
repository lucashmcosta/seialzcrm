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
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuth } from '@/hooks/useAuth';
import { Key, Copy, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const AVAILABLE_SCOPES = [
  { id: 'leads:write', label: 'Criar Leads', description: 'Permite criar contatos e oportunidades via API' },
];

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'crm_live_';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function ApiWebhooksSettings() {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [createKeyDialogOpen, setCreateKeyDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['leads:write']);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [deleteKeyConfirmOpen, setDeleteKeyConfirmOpen] = useState(false);
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);

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
      toast.success('API Key criada com sucesso! Copie a chave agora, ela não será exibida novamente em texto completo.');
      navigator.clipboard.writeText(apiKey);
      queryClient.invalidateQueries({ queryKey: ['organization-api-keys'] });
      setCreateKeyDialogOpen(false);
      setNewKeyName('');
      setNewKeyScopes(['leads:write']);
    },
    onError: (error: any) => {
      toast.error(`Erro ao criar API Key: ${error.message}`);
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await supabase
        .from('organization_api_keys')
        .delete()
        .eq('id', keyId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('API Key excluída com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['organization-api-keys'] });
    },
    onError: (error: any) => {
      toast.error(`Erro ao excluir API Key: ${error.message}`);
    },
  });

  const toggleApiKeyMutation = useMutation({
    mutationFn: async ({ keyId, isActive }: { keyId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('organization_api_keys')
        .update({ is_active: isActive })
        .eq('id', keyId);

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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado para a área de transferência!`);
  };

  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(keyId)) {
        newSet.delete(keyId);
      } else {
        newSet.add(keyId);
      }
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
    if (deletingKeyId) {
      deleteApiKeyMutation.mutate(deletingKeyId);
    }
    setDeleteKeyConfirmOpen(false);
    setDeletingKeyId(null);
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
            Receba leads de fontes externas via API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Webhook URL */}
          <div className="space-y-2">
            <Label>URL do Webhook</Label>
            <div className="flex gap-2">
              <Input
                value={webhookUrl}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(webhookUrl, 'URL do Webhook')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Use esta URL para enviar leads de landing pages, formulários externos, ou integrações como Zapier.
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
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Criar Nova API Key</DialogTitle>
                    <DialogDescription>
                      Crie uma chave de API para integrar sistemas externos.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="keyName">Nome da Key</Label>
                      <Input
                        id="keyName"
                        placeholder="Ex: Landing Page Black Friday"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Permissões</Label>
                      <div className="space-y-3">
                        {AVAILABLE_SCOPES.map((scope) => (
                          <div key={scope.id} className="flex items-start gap-3">
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
                            <div className="grid gap-1.5 leading-none">
                              <label
                                htmlFor={scope.id}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                {scope.label}
                              </label>
                              <p className="text-sm text-muted-foreground">
                                {scope.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setCreateKeyDialogOpen(false)}
                    >
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
                  <div
                    key={key.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => toggleKeyVisibility(key.id)}
                        >
                          {visibleKeys.has(key.id) ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          Escopos: {key.scopes?.join(', ') || 'Nenhum'}
                        </span>
                        {key.last_used_at && (
                          <span className="text-xs text-muted-foreground">
                            • Último uso: {new Date(key.last_used_at).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(key.api_key, 'API Key')}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleApiKeyMutation.mutate({ keyId: key.id, isActive: !key.is_active })}
                      >
                        {key.is_active ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteKeyClick(key.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma API Key criada ainda. Crie uma para começar a receber leads externos.
              </p>
            )}
          </div>

          {/* Documentation */}
          <div className="space-y-3 pt-4 border-t">
            <Label>Como usar</Label>
            <div className="bg-muted rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Faça uma requisição <code className="bg-background px-1 py-0.5 rounded">POST</code> para o webhook com o header <code className="bg-background px-1 py-0.5 rounded">x-api-key</code>:
              </p>
              <pre className="bg-background rounded p-3 overflow-x-auto text-xs">
{`fetch("${webhookUrl}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "SUA_API_KEY"
  },
  body: JSON.stringify({
    name: "João Silva",           // obrigatório
    email: "joao@email.com",      // opcional
    phone: "+5511999999999",      // opcional
    company: "Empresa LTDA",      // opcional
    source: "landing_page",       // opcional
    utm_source: "facebook",       // opcional
    utm_medium: "cpc",            // opcional
    utm_campaign: "black_friday", // opcional
    notes: "Observações...",      // opcional - cria nota
    create_opportunity: true,     // opcional
    opportunity_title: "Lead FB", // opcional
    opportunity_value: 5000       // opcional
  })
});`}
              </pre>
              <p className="text-sm text-muted-foreground">
                <strong>Resposta de sucesso (201):</strong>
              </p>
              <pre className="bg-background rounded p-3 overflow-x-auto text-xs">
{`{
  "success": true,
  "contact_id": "uuid",
  "opportunity_id": "uuid",  // se create_opportunity=true
  "activity_id": "uuid",     // se notes presente
  "message": "Lead created successfully"
}`}
              </pre>
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

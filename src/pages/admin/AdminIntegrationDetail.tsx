import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Save, Trash2, Pencil, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { LogoEditorDialog } from '@/components/admin/LogoEditorDialog';

export default function AdminIntegrationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [logoEditorOpen, setLogoEditorOpen] = useState(false);

  const { data: integration, isLoading } = useQuery({
    queryKey: ['admin-integration', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_integrations')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [formData, setFormData] = useState<any>(integration || {});

  if (integration && !formData.id) {
    setFormData(integration);
  }

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('admin_integrations')
        .update(formData)
        .eq('id', id);

      if (error) throw error;

      toast.success('Integração atualizada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['admin-integrations'] });
      queryClient.invalidateQueries({ queryKey: ['admin-integration', id] });
    } catch (error: any) {
      toast.error('Erro ao atualizar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja excluir esta integração?')) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('admin_integrations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Integração excluída!');
      navigate('/admin/integrations');
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div>Carregando...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/integrations')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-3xl font-bold">{integration?.name}</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Informações Básicas</CardTitle>
            <CardDescription>Configurações gerais da integração</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input
                  value={formData.slug || ''}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="communication">Comunicação</SelectItem>
                    <SelectItem value="payment">Pagamentos</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="automation">Automação</SelectItem>
                    <SelectItem value="other">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coming_soon">Em Breve</SelectItem>
                    <SelectItem value="beta">Beta</SelectItem>
                    <SelectItem value="available">Disponível</SelectItem>
                    <SelectItem value="deprecated">Descontinuada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={formData.sort_order || 0}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Logo da Integração</Label>
              <div className="flex items-center gap-4">
                {formData.logo_url ? (
                  <img
                    src={formData.logo_url}
                    alt="Logo"
                    className="w-16 h-16 rounded-lg object-contain bg-muted p-2"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLogoEditorOpen(true)}
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    {formData.logo_url ? 'Editar Logo' : 'Adicionar Logo'}
                  </Button>
                  {formData.logo_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setFormData({ ...formData, logo_url: '' })}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <LogoEditorDialog
              open={logoEditorOpen}
              onOpenChange={setLogoEditorOpen}
              currentLogoUrl={formData.logo_url}
              onSave={(url) => setFormData({ ...formData, logo_url: url })}
              integrationSlug={formData.slug}
            />
            <div className="space-y-2">
              <Label>URL da Documentação</Label>
              <Input
                value={formData.documentation_url || ''}
                onChange={(e) => setFormData({ ...formData, documentation_url: e.target.value })}
                placeholder="https://docs.exemplo.com"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuração Master (JSON)</CardTitle>
            <CardDescription>
              Credenciais e configurações globais (App ID, Secret, OAuth URLs, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={JSON.stringify(formData.master_config || {}, null, 2)}
              onChange={(e) => {
                try {
                  setFormData({ ...formData, master_config: JSON.parse(e.target.value) });
                } catch {}
              }}
              rows={10}
              className="font-mono text-sm"
            />
          </CardContent>
        </Card>
      </div>
      </div>
    </AdminLayout>
  );
}
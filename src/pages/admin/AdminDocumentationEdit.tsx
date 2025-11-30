import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Save, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MarkdownEditor } from '@/components/admin/MarkdownEditor';

export default function AdminDocumentationEdit() {
  const { module } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const { data: doc } = useQuery({
    queryKey: ['documentation', module],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documentation')
        .select('*')
        .eq('module', module)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
  });

  const [formData, setFormData] = useState<{
    title: string;
    content: string;
    version: string;
    is_public: boolean;
    status: 'draft' | 'published';
  }>({
    title: '',
    content: '',
    version: '1.0.0',
    is_public: false,
    status: 'draft',
  });

  useEffect(() => {
    if (doc) {
      setFormData({
        title: doc.title,
        content: doc.content,
        version: doc.version,
        is_public: doc.is_public,
        status: doc.status as 'draft' | 'published',
      });
    }
  }, [doc]);

  const handleSave = async (publishNow = false) => {
    setLoading(true);
    try {
      const payload = {
        module,
        ...formData,
        status: publishNow ? 'published' : formData.status,
      };

      if (doc) {
        const { error } = await supabase
          .from('documentation')
          .update(payload)
          .eq('id', doc.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('documentation')
          .insert([payload]);
        if (error) throw error;
      }

      toast.success(publishNow ? 'Documentação publicada!' : 'Documentação salva!');
      queryClient.invalidateQueries({ queryKey: ['documentation'] });
      queryClient.invalidateQueries({ queryKey: ['admin-documentation'] });
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/documentation')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Editar Documentação</h1>
            <p className="text-muted-foreground">Módulo: <code>{module}</code></p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleSave(false)} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            Salvar Rascunho
          </Button>
          <Button onClick={() => handleSave(true)} disabled={loading}>
            <Eye className="h-4 w-4 mr-2" />
            {loading ? 'Publicando...' : 'Publicar'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Configurações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Como usar Contatos"
                />
              </div>
              <div className="space-y-2">
                <Label>Versão</Label>
                <Input
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  placeholder="1.0.0"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Documentação Pública</Label>
                <p className="text-sm text-muted-foreground">
                  Permitir que usuários do CRM vejam esta documentação
                </p>
              </div>
              <Switch
                checked={formData.is_public}
                onCheckedChange={(checked) => setFormData({ ...formData, is_public: checked })}
              />
            </div>
          </CardContent>
        </Card>

        <MarkdownEditor
          content={formData.content}
          onChange={(content) => setFormData({ ...formData, content })}
        />
      </div>
    </div>
  );
}
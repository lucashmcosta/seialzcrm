import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Plus, FileText, Eye, EyeOff, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';

export default function AdminDocumentation() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  const { data: docs, isLoading } = useQuery({
    queryKey: ['admin-documentation'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documentation')
        .select('*')
        .order('module');
      if (error) throw error;
      return data;
    },
  });

  const filteredDocs = docs?.filter(doc =>
    doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.module.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const modules = [
    { key: 'getting-started', label: 'Primeiros Passos' },
    { key: 'contacts', label: 'Contatos' },
    { key: 'companies', label: 'Empresas' },
    { key: 'opportunities', label: 'Oportunidades' },
    { key: 'tasks', label: 'Tarefas' },
    { key: 'users', label: 'Usuários e Permissões' },
    { key: 'integrations', label: 'Integrações' },
    { key: 'billing', label: 'Planos e Cobrança' },
  ];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Documentação</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie a documentação do sistema
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <Input
          placeholder="Buscar documentação..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12">Carregando...</div>
      ) : (
        <div className="grid gap-4">
          {modules.map((module) => {
            const doc = docs?.find(d => d.module === module.key);
            
            return (
              <Card key={module.key} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-lg">{module.label}</CardTitle>
                        <CardDescription>
                          Módulo: <code className="text-xs">{module.key}</code>
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc ? (
                        <>
                          <Badge variant={doc.status === 'published' ? 'default' : 'outline'}>
                            {doc.status === 'published' ? 'Publicado' : 'Rascunho'}
                          </Badge>
                          {doc.is_public ? (
                            <Badge variant="secondary">
                              <Eye className="h-3 w-3 mr-1" />
                              Público
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              <EyeOff className="h-3 w-3 mr-1" />
                              Interno
                            </Badge>
                          )}
                        </>
                      ) : (
                        <Badge variant="outline">Não criado</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {doc ? (
                        <>
                          <span>Versão {doc.version}</span>
                          <span className="mx-2">•</span>
                          <span>Atualizado em {format(new Date(doc.updated_at), 'dd/MM/yyyy HH:mm')}</span>
                        </>
                      ) : (
                        'Nenhuma documentação criada ainda'
                      )}
                    </div>
                    <Button
                      onClick={() => navigate(`/admin/documentation/${module.key}`)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      {doc ? 'Editar' : 'Criar'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
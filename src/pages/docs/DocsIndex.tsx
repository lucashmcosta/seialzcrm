import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, BookOpen, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function DocsIndex() {
  const [searchTerm, setSearchTerm] = useState('');
  const { isAuthenticated } = useAuth();

  const { data: documentation, isLoading } = useQuery({
    queryKey: ['public-documentation'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documentation')
        .select('*')
        .eq('is_public', true)
        .eq('status', 'published')
        .order('title');

      if (error) throw error;
      return data;
    },
  });

  const filteredDocs = documentation?.filter(doc =>
    doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.module.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const modules = [
    { key: 'getting-started', label: 'Primeiros Passos', description: 'Aprenda os conceitos básicos' },
    { key: 'contacts', label: 'Contatos', description: 'Gerenciamento de contatos' },
    { key: 'opportunities', label: 'Oportunidades', description: 'Pipeline de vendas' },
    { key: 'tasks', label: 'Tarefas', description: 'Gestão de atividades' },
    { key: 'settings', label: 'Configurações', description: 'Personalize seu CRM' },
    { key: 'integrations', label: 'Integrações', description: 'Conecte suas ferramentas' },
    { key: 'api', label: 'API', description: 'Documentação técnica' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BookOpen className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">Central de Ajuda</h1>
                <p className="text-sm text-muted-foreground">Documentação e tutoriais do Seialz CRM</p>
              </div>
            </div>
            {isAuthenticated && (
              <Button variant="outline" asChild>
                <Link to="/dashboard">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar ao CRM
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Search */}
        <div className="max-w-2xl mx-auto mb-12">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Buscar na documentação..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Modules Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando documentação...</p>
          </div>
        ) : filteredDocs && filteredDocs.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDocs.map((doc) => {
              const moduleInfo = modules.find(m => m.key === doc.module);
              return (
                <Link key={doc.id} to={`/docs/${doc.module}`}>
                  <Card className="h-full hover:border-primary transition-colors cursor-pointer">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-primary" />
                        {doc.title}
                      </CardTitle>
                      <CardDescription>
                        {moduleInfo?.description || doc.module}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-muted-foreground">
                        <p className="line-clamp-2">
                          {doc.content.substring(0, 150)}...
                        </p>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Versão {doc.version}</span>
                        <span>{new Date(doc.updated_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {searchTerm ? 'Nenhum resultado encontrado' : 'Documentação em breve'}
            </h3>
            <p className="text-muted-foreground">
              {searchTerm 
                ? 'Tente buscar por outros termos'
                : 'A documentação está sendo preparada e estará disponível em breve.'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

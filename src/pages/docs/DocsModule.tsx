import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, BookOpen, Calendar, Tag } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function DocsModule() {
  const { module } = useParams();
  const { isAuthenticated } = useAuth();

  const { data: documentation, isLoading } = useQuery({
    queryKey: ['documentation', module],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documentation')
        .select('*')
        .eq('module', module)
        .eq('is_public', true)
        .eq('status', 'published')
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: allDocs } = useQuery({
    queryKey: ['all-documentation'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documentation')
        .select('module, title')
        .eq('is_public', true)
        .eq('status', 'published')
        .order('title');

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando documentação...</p>
      </div>
    );
  }

  if (!documentation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">Documentação não encontrada</h2>
          <p className="text-muted-foreground mb-6">Este módulo ainda não possui documentação disponível.</p>
          <Button asChild>
            <Link to="/docs">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para Central de Ajuda
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link to="/docs" className="hover:text-foreground transition-colors">
                Docs
              </Link>
              <span>/</span>
              <span className="text-foreground font-medium">{documentation.title}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/docs">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar
                </Link>
              </Button>
              {isAuthenticated && (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/dashboard">
                    Ir para CRM
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Sidebar with navigation */}
          <aside className="lg:col-span-1">
            <Card className="p-4 sticky top-24">
              <h3 className="font-semibold text-sm text-foreground mb-3">Navegação</h3>
              <nav className="space-y-1">
                {allDocs?.map((doc) => (
                  <Link
                    key={doc.module}
                    to={`/docs/${doc.module}`}
                    className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                      doc.module === module
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {doc.title}
                  </Link>
                ))}
              </nav>
            </Card>
          </aside>

          {/* Main content */}
          <main className="lg:col-span-3">
            <article>
              <header className="mb-8">
                <h1 className="text-4xl font-bold text-foreground mb-4">
                  {documentation.title}
                </h1>
                
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Tag className="w-4 h-4" />
                    <span>Versão {documentation.version}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>
                      Atualizado em {new Date(documentation.updated_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>

                <Separator className="mt-6" />
              </header>

              {/* Markdown content */}
              <div className="prose prose-slate dark:prose-invert max-w-none">
                <div 
                  className="text-foreground"
                  dangerouslySetInnerHTML={{ 
                    __html: documentation.content.replace(/\n/g, '<br />') 
                  }} 
                />
              </div>
            </article>

            {/* Footer */}
            <footer className="mt-12 pt-8 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Esta documentação foi útil? Envie seu feedback para suporte@seialz.com
              </p>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}

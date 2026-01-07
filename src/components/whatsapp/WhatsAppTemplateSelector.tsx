import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ArrowLeft, Check } from 'lucide-react';

interface Template {
  id: string;
  friendly_name: string;
  body: string;
  variables: unknown;
  status: string;
  category: string | null;
}

interface WhatsAppTemplateSelectorProps {
  onSelect: (templateId: string, variables: Record<string, string>) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function WhatsAppTemplateSelector({ 
  onSelect, 
  onCancel,
  loading 
}: WhatsAppTemplateSelectorProps) {
  const { organization } = useOrganization();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchTemplates();
  }, [organization?.id]);

  const fetchTemplates = async () => {
    if (!organization?.id) return;

    try {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('status', 'approved')
        .eq('is_active', true)
        .order('friendly_name');

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const extractVariables = (body: string): string[] => {
    const matches = body.match(/\{\{(\d+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))];
  };

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    // Initialize variables
    const vars = extractVariables(template.body);
    const initialVars: Record<string, string> = {};
    vars.forEach(v => { initialVars[v] = ''; });
    setVariables(initialVars);
  };

  const handleSend = () => {
    if (!selectedTemplate) return;
    onSelect(selectedTemplate.id, variables);
  };

  const getPreviewBody = () => {
    if (!selectedTemplate) return '';
    let preview = selectedTemplate.body;
    Object.entries(variables).forEach(([key, value]) => {
      preview = preview.replace(`{{${key}}}`, value || `[${key}]`);
    });
    return preview;
  };

  if (loadingTemplates) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (selectedTemplate) {
    const vars = extractVariables(selectedTemplate.body);

    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedTemplate(null)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{selectedTemplate.friendly_name}</CardTitle>
            <CardDescription>Preencha as variáveis do template</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {vars.length > 0 && (
              <div className="space-y-3">
                {vars.map((varName) => (
                  <div key={varName} className="space-y-1">
                    <Label htmlFor={`var-${varName}`}>Variável {varName}</Label>
                    <Input
                      id={`var-${varName}`}
                      value={variables[varName] || ''}
                      onChange={(e) =>
                        setVariables({ ...variables, [varName]: e.target.value })
                      }
                      placeholder={`Valor para {{${varName}}}`}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Preview */}
            <div className="p-3 bg-green-100 dark:bg-green-900/40 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Prévia:</p>
              <p className="text-sm whitespace-pre-wrap">{getPreviewBody()}</p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={onCancel} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={handleSend} 
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Enviar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">Selecione um Template</h4>
          <p className="text-xs text-muted-foreground">
            Fora da janela de 24h, use um template aprovado
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Nenhum template disponível</p>
            <p className="text-xs text-muted-foreground mt-1">
              Crie templates no Twilio e sincronize em Configurações
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-2">
            {templates.map((template) => (
              <Card
                key={template.id}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleSelectTemplate(template)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {template.friendly_name}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {template.body}
                      </p>
                    </div>
                    {template.category && (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded shrink-0">
                        {template.category}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

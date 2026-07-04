import { useState, useEffect, useMemo } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SpinnerGap, ArrowLeft, Check, LockSimple } from '@phosphor-icons/react';
import {
  getLowEndpointConfig,
  isMarketingBlockedWhenWindowOpen,
} from '@/lib/complianceGuards';

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
  /**
   * Filtra templates pelo provider correto.
   * Quando omitido, mantém o comportamento legado e lista apenas templates Twilio
   * (provider 'twilio' ou rows antigas sem provider).
   */
  provider?: 'twilio' | 'meta_cloud_api';
  /**
   * Compliance: endpoint de envio, usado para bloquear templates específicos
   * do endpoint (ex: 7020 em LOW → esconde primeiro_contato/tentativa_de_contato).
   */
  endpointId?: string | null;
  /**
   * Compliance: se a janela de atendimento (24h/CTWA 72h) está aberta,
   * bloqueia templates categoria MARKETING — o correto é responder freeform.
   */
  windowIsOpen?: boolean;
}

export function WhatsAppTemplateSelector({
  onSelect,
  onCancel,
  loading,
  provider,
  endpointId,
  windowIsOpen = false,
}: WhatsAppTemplateSelectorProps) {
  const { organization } = useOrganization();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});

  const lowCfg = useMemo(() => getLowEndpointConfig(endpointId ?? null), [endpointId]);
  const blockedIds = useMemo(() => new Set(lowCfg?.blockedTemplateIds ?? []), [lowCfg]);

  useEffect(() => {
    fetchTemplates();
  }, [organization?.id, provider]);

  const fetchTemplates = async () => {
    if (!organization?.id) return;

    try {
      let query = supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('status', 'approved')
        .eq('is_active', true);

      if (provider === 'meta_cloud_api') {
        query = query.eq('provider', 'meta_cloud_api');
      } else {
        // Default Twilio: inclui rows antigas (provider IS NULL) e provider='twilio'.
        query = query.or('provider.is.null,provider.eq.twilio');
      }

      const { data, error } = await query.order('friendly_name');

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  /** Retorna motivo de bloqueio ou null se liberado. */
  const blockedReason = (t: Template): string | null => {
    if (blockedIds.has(t.id)) return lowCfg?.reason ?? 'Template bloqueado para este número.';
    if (isMarketingBlockedWhenWindowOpen(t.category, windowIsOpen)) {
      return 'Janela aberta — responda em texto livre. Marketing só fora da janela.';
    }
    return null;
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
        <SpinnerGap className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (selectedTemplate) {
    const vars = extractVariables(selectedTemplate.body);

    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 px-4 pt-4 pb-2 space-y-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedTemplate(null)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h4 className="text-base font-semibold">{selectedTemplate.friendly_name}</h4>
            <p className="text-xs text-muted-foreground">Preencha as variáveis do template</p>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-4">
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
        </div>

        <div className="shrink-0 flex gap-2 px-4 py-3 border-t">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            className="flex-1 bg-green-600 hover:bg-green-700"
            disabled={loading}
          >
            {loading ? (
              <SpinnerGap className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Enviar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
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
        <Card className="mx-4">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Nenhum template disponível</p>
            <p className="text-xs text-muted-foreground mt-1">
              Crie templates no Twilio e sincronize em Configurações
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
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
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TemplateTypeSelector, TemplateType } from '@/components/whatsapp/templates/TemplateTypeSelector';
import { WhatsAppPreview } from '@/components/whatsapp/templates/WhatsAppPreview';
import { VariablesTable, Variable } from '@/components/whatsapp/templates/VariablesTable';
import { 
  useTemplate, 
  useCreateTemplate, 
  useUpdateTemplate,
} from '@/hooks/useWhatsAppTemplates';
import { useOrganization } from '@/hooks/useOrganization';
import { getTemplateNameError, extractVariables } from '@/lib/template-validation';
import { 
  ArrowLeft, 
  ArrowRight, 
  Plus, 
  X, 
  Loader2, 
  AlertCircle,
  Save,
} from 'lucide-react';

interface QuickReplyButton {
  id: string;
  title: string;
}

interface CTAAction {
  type: 'url' | 'phone' | 'copy_code';
  title: string;
  value: string;
}

export default function TemplateForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  
  const { organization } = useOrganization();
  const { data: existingTemplate, isLoading: templateLoading } = useTemplate(
    organization?.id, 
    isEditing ? id : undefined
  );
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();

  // Form state
  const [step, setStep] = useState(1);
  const [friendlyName, setFriendlyName] = useState('');
  const [language, setLanguage] = useState<string>('pt_BR');
  const [category, setCategory] = useState<string>('UTILITY');
  const [templateType, setTemplateType] = useState<TemplateType>('text');
  const [body, setBody] = useState('');
  const [header, setHeader] = useState('');
  const [footer, setFooter] = useState('');
  const [variables, setVariables] = useState<Variable[]>([]);
  const [buttons, setButtons] = useState<QuickReplyButton[]>([]);
  const [actions, setActions] = useState<CTAAction[]>([]);
  const [mediaUrl, setMediaUrl] = useState('');

  // Load existing template data
  useEffect(() => {
    if (existingTemplate) {
      setFriendlyName(existingTemplate.friendly_name);
      setLanguage(existingTemplate.language);
      setCategory(existingTemplate.category || 'UTILITY');
      setTemplateType(existingTemplate.template_type as TemplateType);
      setBody(existingTemplate.body);
      setHeader(existingTemplate.header || '');
      setFooter(existingTemplate.footer || '');
      setVariables(existingTemplate.variables || []);
      setButtons(existingTemplate.buttons || []);
      setActions((existingTemplate.actions || []).map(a => ({
        type: a.type as 'url' | 'phone' | 'copy_code',
        title: a.title,
        value: a.value || '',
      })));
    }
  }, [existingTemplate]);

  // Validation
  const nameError = getTemplateNameError(friendlyName);
  const bodyError = !body.trim() ? 'Corpo é obrigatório' : body.length > 1024 ? 'Máximo 1024 caracteres' : null;

  const isStep1Valid = !nameError && language && category && templateType;
  const isStep2Valid = !bodyError;
  const isStep3Valid = variables.every(v => v.example.trim()) || variables.length === 0;

  // Insert variable at cursor
  const handleInsertVariable = () => {
    const nextVarNum = extractVariables(body).length + 1;
    setBody(prev => prev + `{{${nextVarNum}}}`);
  };

  // Quick Reply buttons
  const handleAddButton = () => {
    if (buttons.length >= 10) return;
    setButtons([...buttons, { id: `btn_${Date.now()}`, title: '' }]);
  };

  const handleRemoveButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const handleButtonChange = (index: number, title: string) => {
    const updated = [...buttons];
    updated[index] = { ...updated[index], title };
    setButtons(updated);
  };

  // CTA Actions
  const handleAddAction = () => {
    if (actions.length >= 3) return;
    setActions([...actions, { type: 'url', title: '', value: '' }]);
  };

  const handleRemoveAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleActionChange = (index: number, field: keyof CTAAction, value: string) => {
    const updated = [...actions];
    updated[index] = { ...updated[index], [field]: value };
    setActions(updated);
  };

  // Submit
  const handleSubmit = async () => {
    if (!organization?.id) return;

    const data = {
      organization_id: organization.id,
      friendly_name: friendlyName,
      language,
      category,
      template_type: templateType,
      body,
      header: header || undefined,
      footer: footer || undefined,
      variables: variables.length > 0 ? variables : undefined,
      buttons: buttons.length > 0 ? buttons : undefined,
      actions: actions.length > 0 ? actions : undefined,
    };

    try {
      if (isEditing && id) {
        await updateMutation.mutateAsync({ id, data });
      } else {
        await createMutation.mutateAsync(data);
      }
      navigate('/settings?tab=whatsappTemplates');
    } catch (error) {
      // Error handled by mutation
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (isEditing && templateLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/settings?tab=whatsappTemplates')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-3xl font-bold">
            {isEditing ? 'Editar Template' : 'Novo Template'}
          </h1>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  s === step
                    ? 'bg-primary text-primary-foreground'
                    : s < step
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {s}
              </div>
              {s < 3 && (
                <div className={`w-12 h-0.5 mx-2 ${s < step ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Form */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>
                  {step === 1 && 'Informações Básicas'}
                  {step === 2 && 'Conteúdo da Mensagem'}
                  {step === 3 && 'Variáveis'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Step 1: Basic Info */}
                {step === 1 && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="friendlyName">Nome do Template *</Label>
                      <Input
                        id="friendlyName"
                        value={friendlyName}
                        onChange={(e) => setFriendlyName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                        placeholder="ex: boas_vindas_cliente"
                        className={nameError && friendlyName ? 'border-destructive' : ''}
                      />
                      {nameError && friendlyName && (
                        <p className="text-xs text-destructive">{nameError}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Use apenas letras minúsculas, números e underscores
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Idioma</Label>
                        <Select value={language} onValueChange={setLanguage}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pt_BR">Português (Brasil)</SelectItem>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="es">Español</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Categoria</Label>
                        <Select value={category} onValueChange={setCategory}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="UTILITY">Utilidade</SelectItem>
                            <SelectItem value="MARKETING">Marketing</SelectItem>
                            <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Tipo de Template</Label>
                      <TemplateTypeSelector 
                        value={templateType} 
                        onValueChange={setTemplateType}
                        disabled={isEditing}
                      />
                    </div>
                  </>
                )}

                {/* Step 2: Content */}
                {step === 2 && (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="body">Corpo da Mensagem *</Label>
                        <Button type="button" variant="outline" size="sm" onClick={handleInsertVariable}>
                          <Plus className="w-3 h-3 mr-1" />
                          Variável
                        </Button>
                      </div>
                      <Textarea
                        id="body"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Olá {{1}}, sua reserva foi confirmada para {{2}}."
                        rows={5}
                        className={bodyError && body ? 'border-destructive' : ''}
                      />
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          Use {'{{1}}'}, {'{{2}}'}, etc. para variáveis
                        </span>
                        <span className={body.length > 1024 ? 'text-destructive' : 'text-muted-foreground'}>
                          {body.length}/1024
                        </span>
                      </div>
                    </div>

                    {/* Quick Reply buttons */}
                    {templateType === 'quick-reply' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>Botões de Resposta Rápida</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAddButton}
                            disabled={buttons.length >= 10}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Botão
                          </Button>
                        </div>
                        <Alert>
                          <AlertCircle className="w-4 h-4" />
                          <AlertDescription>
                            Títulos dos botões são fixos após aprovação pelo WhatsApp.
                          </AlertDescription>
                        </Alert>
                        {buttons.map((button, index) => (
                          <div key={button.id} className="flex gap-2">
                            <Input
                              placeholder={`Botão ${index + 1} (máx 20 caracteres)`}
                              value={button.title}
                              onChange={(e) => handleButtonChange(index, e.target.value)}
                              maxLength={20}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveButton(index)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* CTA actions */}
                    {templateType === 'call-to-action' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>Ações</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAddAction}
                            disabled={actions.length >= 3}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Ação
                          </Button>
                        </div>
                        <Alert>
                          <AlertCircle className="w-4 h-4" />
                          <AlertDescription>
                            Máximo 2 URLs e 1 telefone. Títulos não aceitam variáveis.
                          </AlertDescription>
                        </Alert>
                        {actions.map((action, index) => (
                          <div key={index} className="space-y-2 p-3 bg-muted/50 rounded-lg">
                            <div className="flex gap-2">
                              <Select
                                value={action.type}
                                onValueChange={(v) => handleActionChange(index, 'type', v)}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="url">URL</SelectItem>
                                  <SelectItem value="phone">Telefone</SelectItem>
                                  <SelectItem value="copy_code">Código</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                placeholder="Título (máx 25 caracteres)"
                                value={action.title}
                                onChange={(e) => handleActionChange(index, 'title', e.target.value)}
                                maxLength={25}
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveAction(index)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                            <Input
                              placeholder={
                                action.type === 'url'
                                  ? 'https://exemplo.com/{{1}}'
                                  : action.type === 'phone'
                                  ? '+5511999999999'
                                  : 'CODIGO123'
                              }
                              value={action.value}
                              onChange={(e) => handleActionChange(index, 'value', e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Media URL */}
                    {templateType === 'media' && (
                      <div className="space-y-2">
                        <Label htmlFor="mediaUrl">URL da Mídia</Label>
                        <Input
                          id="mediaUrl"
                          value={mediaUrl}
                          onChange={(e) => setMediaUrl(e.target.value)}
                          placeholder="https://exemplo.com/imagem.jpg"
                        />
                        <p className="text-xs text-muted-foreground">
                          Suporta variável no final: https://exemplo.com/{'{{1}}'}.jpg
                        </p>
                      </div>
                    )}

                    {/* List picker warning */}
                    {templateType === 'list-picker' && (
                      <Alert variant="destructive">
                        <AlertCircle className="w-4 h-4" />
                        <AlertDescription>
                          Este tipo só funciona IN-SESSION (dentro da janela de 24h) e NÃO pode ser aprovado pelo WhatsApp.
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}

                {/* Step 3: Variables */}
                {step === 3 && (
                  <VariablesTable
                    body={body}
                    variables={variables}
                    onChange={setVariables}
                  />
                )}

                {/* Navigation */}
                <div className="flex justify-between pt-4">
                  {step > 1 ? (
                    <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Anterior
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" onClick={() => navigate('/whatsapp/templates')}>
                      Cancelar
                    </Button>
                  )}

                  {step < 3 ? (
                    <Button
                      type="button"
                      onClick={() => setStep(step + 1)}
                      disabled={step === 1 ? !isStep1Valid : !isStep2Valid}
                    >
                      Próximo
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSubmit}
                      disabled={!isStep3Valid || isSubmitting}
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      {isEditing ? 'Salvar Alterações' : 'Criar Template'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview */}
          <div className="lg:col-span-2">
            <div className="sticky top-6">
              <Label className="mb-2 block">Prévia</Label>
              <WhatsAppPreview
                body={body}
                header={header}
                footer={footer}
                variables={variables}
                buttons={templateType === 'quick-reply' ? buttons : []}
                actions={templateType === 'call-to-action' ? actions : []}
                mediaUrl={templateType === 'media' ? mediaUrl : undefined}
              />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

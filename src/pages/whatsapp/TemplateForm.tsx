import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { Checkbox } from '@/components/ui/checkbox';
import { TemplateTypeSelector, TemplateType } from '@/components/whatsapp/templates/TemplateTypeSelector';
import { WhatsAppPreview } from '@/components/whatsapp/templates/WhatsAppPreview';
import { VariablesTable, Variable } from '@/components/whatsapp/templates/VariablesTable';
import {
  useTemplate,
  useCreateTemplate,
  useUpdateTemplate,
  useCreateMetaTemplate,
} from '@/hooks/useWhatsAppTemplates';
import { useOrganization } from '@/hooks/useOrganization';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getTemplateNameError, extractVariables } from '@/lib/template-validation';
import { 
  ArrowLeft, 
  ArrowRight, 
  Plus, 
  X, 
  SpinnerGap, 
  WarningCircle,
  FloppyDisk,
} from '@phosphor-icons/react';

interface QuickReplyButton {
  id: string;
  title: string;
}

interface CTAAction {
  type: 'url' | 'phone' | 'copy_code';
  title: string;
  value: string;
  /** Somente Meta: exemplo do {{1}} no final do link. */
  example?: string;
}

type MetaHeaderFormat = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
// Mesmos limites validados em meta-whatsapp-templates-create/components.ts.
const META_HEADER_MEDIA: Record<'IMAGE' | 'VIDEO' | 'DOCUMENT', { accept: string; types: string[]; maxMb: number; label: string }> = {
  IMAGE: { accept: 'image/jpeg,image/png', types: ['image/jpeg', 'image/png'], maxMb: 5, label: 'JPG ou PNG, até 5 MB' },
  VIDEO: { accept: 'video/mp4', types: ['video/mp4'], maxMb: 16, label: 'MP4, até 16 MB' },
  DOCUMENT: { accept: 'application/pdf', types: ['application/pdf'], maxMb: 100, label: 'PDF, até 100 MB' },
};

export default function TemplateForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const providerParam = searchParams.get('provider');
  const isMetaProvider = providerParam === 'meta_cloud_api';
  const isEditing = !!id;

  const { organization } = useOrganization();
  const { data: existingTemplate, isLoading: templateLoading } = useTemplate(
    organization?.id,
    isEditing ? id : undefined
  );
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();
  const createMetaMutation = useCreateMetaTemplate();

  // Contas Meta conectadas (uma organização pode ter mais de um número/WABA)
  const { data: metaAccounts = [] } = useQuery({
    queryKey: ['meta-template-accounts', organization?.id],
    enabled: isMetaProvider && !isEditing && !!organization?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('id, connected_account, admin_integrations!inner(slug)')
        .eq('organization_id', organization!.id)
        .eq('is_enabled', true)
        .eq('admin_integrations.slug', 'meta-whatsapp-cloud');
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id as string,
        label: [r.connected_account?.display_phone_number, r.connected_account?.verified_name]
          .filter(Boolean).join(' — ') || r.id,
      }));
    },
  });
  const [metaAccountId, setMetaAccountId] = useState<string>('');
  useEffect(() => {
    if (metaAccounts.length === 1) setMetaAccountId(metaAccounts[0].id);
  }, [metaAccounts]);
  const needsMetaAccount = isMetaProvider && !isEditing && metaAccounts.length > 1;

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
  // Cabeçalho Meta (texto ou mídia de exemplo enviada ao storage da org)
  const [headerFormat, setHeaderFormat] = useState<MetaHeaderFormat>('NONE');
  const [headerExample, setHeaderExample] = useState('');
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [headerMediaName, setHeaderMediaName] = useState('');
  const [headerMediaUploading, setHeaderMediaUploading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Autenticação (OTP) — somente Meta Cloud, criação nova
  const [authSecurity, setAuthSecurity] = useState(true);
  const [authExpiry, setAuthExpiry] = useState<number>(5);
  const [authButtonText, setAuthButtonText] = useState('Copiar código');
  const isAuth = isMetaProvider && !isEditing && category === 'AUTHENTICATION';

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
  const bodyStartsWithVariable = /^\s*\{\{\d+\}\}/.test(body);

  const isStep1Valid = !nameError && language && category && templateType;
  const authExpiryValid = Number.isInteger(authExpiry) && authExpiry >= 1 && authExpiry <= 90;
  const authButtonValid = authButtonText.trim().length > 0 && authButtonText.length <= 25;
  const isMetaCreate = isMetaProvider && !isEditing;
  const isMetaMediaHeader = isMetaCreate && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat);
  const headerHasVar = isMetaCreate && headerFormat === 'TEXT' && header.includes('{{1}}');
  const metaHeaderValid = !isMetaCreate || (
    isMetaMediaHeader
      ? !!headerMediaUrl && !headerMediaUploading
      : headerFormat !== 'TEXT' || (header.trim().length > 0 && header.length <= 60 && (!headerHasVar || headerExample.trim().length > 0))
  );
  const isStep2Valid = isAuth
    ? authExpiryValid && authButtonValid
    : !bodyError && !bodyStartsWithVariable && metaHeaderValid;
  const isStep3Valid = variables.every(v => v.example.trim()) || variables.length === 0;

  // Insert variable at cursor
  const handleInsertVariable = () => {
    const nextVarNum = extractVariables(body).length + 1;
    setBody(prev => prev + `{{${nextVarNum}}}`);
  };

  // Sanitize button titles: WhatsApp não aceita emojis, quebras de linha,
  // variáveis ou caracteres de formatação em títulos de botões.
  const sanitizeButtonTitle = (value: string): string => {
    return value
      // remove quebras de linha e tabs
      .replace(/[\r\n\t]+/g, ' ')
      // remove emojis e símbolos pictográficos
      .replace(/\p{Extended_Pictographic}/gu, '')
      // remove variable markers {{ }}
      .replace(/[{}]/g, '')
      // remove caracteres de formatação WhatsApp (* _ ~ `)
      .replace(/[*_~`]/g, '')
      // colapsa espaços
      .replace(/\s{2,}/g, ' ');
  };

  // Quick Reply buttons
  const totalButtons = buttons.length + (isMetaCreate ? actions.length : 0);
  const handleAddButton = () => {
    if (totalButtons >= 10) return;
    setButtons([...buttons, { id: `btn_${Date.now()}`, title: '' }]);
  };

  const handleRemoveButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const handleButtonChange = (index: number, title: string) => {
    const updated = [...buttons];
    updated[index] = { ...updated[index], title: sanitizeButtonTitle(title) };
    setButtons(updated);
  };

  // CTA Actions
  // Meta: até 2 links + 1 telefone + 1 copiar código.
  const maxActions = isMetaCreate ? 4 : 3;
  const handleAddAction = () => {
    if (actions.length >= maxActions || totalButtons >= 10) return;
    setActions([...actions, { type: 'url', title: '', value: '' }]);
  };

  const handleRemoveAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleActionChange = (index: number, field: keyof CTAAction, value: string) => {
    const updated = [...actions];
    const sanitized = field === 'title' ? sanitizeButtonTitle(value) : value;
    updated[index] = { ...updated[index], [field]: sanitized };
    setActions(updated);
  };

  // Upload do arquivo de exemplo do cabeçalho (mesmo bucket das mídias de mensagens).
  const handleHeaderMediaFile = async (file: File | undefined) => {
    if (!file || !organization?.id || !isMetaMediaHeader) return;
    const spec = META_HEADER_MEDIA[headerFormat as 'IMAGE' | 'VIDEO' | 'DOCUMENT'];
    if (!spec.types.includes(file.type) || file.size > spec.maxMb * 1024 * 1024) {
      toast.error(`Arquivo inválido: use ${spec.label}.`);
      return;
    }
    setHeaderMediaUploading(true);
    try {
      const safeName = file.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80) || 'arquivo';
      const filePath = `${organization.id}/templates/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(filePath, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath);
      setHeaderMediaUrl(publicUrl);
      setHeaderMediaName(file.name);
    } catch (e) {
      toast.error(`Falha ao enviar o arquivo: ${(e as Error).message}`);
    } finally {
      setHeaderMediaUploading(false);
    }
  };

  // Submit
  const handleSubmit = async () => {
    if (!organization?.id) return;
    setSubmitError(null);

    try {
      if (needsMetaAccount && !metaAccountId) {
        toast.error('Escolha a conta Meta (número) do template.');
        return;
      }
      if (isAuth) {
        await createMetaMutation.mutateAsync({
          organizationId: organization.id,
          organizationIntegrationId: metaAccountId || undefined,
          name: friendlyName,
          language,
          category: 'AUTHENTICATION',
          body: '',
          authentication: {
            add_security_recommendation: authSecurity,
            code_expiration_minutes: authExpiry,
            button_text: authButtonText.trim(),
          },
        });
        navigate('/settings/whatsapp-templates');
        return;
      }

      if (isMetaProvider && !isEditing) {
        await createMetaMutation.mutateAsync({
          organizationId: organization.id,
          organizationIntegrationId: metaAccountId || undefined,
          name: friendlyName,
          language,
          category,
          body,
          headerFormat: headerFormat === 'NONE' ? undefined : headerFormat,
          header: headerFormat === 'TEXT' && header.trim() ? header : undefined,
          headerExample: headerHasVar ? headerExample.trim() : undefined,
          headerMediaUrl: isMetaMediaHeader ? headerMediaUrl : undefined,
          footer: footer || undefined,
          variables: variables.length > 0 ? variables : undefined,
          buttons: buttons.length > 0 ? buttons : undefined,
          actions: actions.length > 0
            ? actions.map(a => ({
                type: a.type,
                title: a.title,
                value: a.value.trim(),
                example: a.type === 'url' && a.value.includes('{{1}}') ? (a.example || '').trim() : undefined,
              }))
            : undefined,
        });
        navigate('/settings/whatsapp-templates');
        return;
      }

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

      if (isEditing && id) {
        await updateMutation.mutateAsync({ id, data });
      } else {
        await createMutation.mutateAsync(data);
      }
      navigate('/settings/whatsapp-templates');
    } catch (error) {
      // Toast vem da mutation; a mensagem da Meta/validação fica visível no formulário.
      if (isMetaCreate) setSubmitError((error as Error)?.message || 'Erro ao criar template na Meta.');
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending || createMetaMutation.isPending;

  if (isEditing && templateLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <SpinnerGap className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/settings/whatsapp-templates')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-3xl font-bold">
            {isEditing ? 'Editar Template' : isMetaProvider ? 'Novo Template Meta Cloud' : 'Novo Template'}
          </h1>
        </div>

        {isMetaProvider && !isEditing && (
          <Alert>
            <WarningCircle className="w-4 h-4" />
            <AlertDescription>
              Templates Meta são enviados para aprovação automaticamente ao criar. Após aprovação não poderão ser editados.
            </AlertDescription>
          </Alert>
        )}

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
                    {needsMetaAccount && (
                      <div className="space-y-2">
                        <Label>Conta Meta (número) *</Label>
                        <Select value={metaAccountId} onValueChange={setMetaAccountId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Escolha o número" />
                          </SelectTrigger>
                          <SelectContent>
                            {metaAccounts.map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          O template será criado somente na conta deste número.
                        </p>
                      </div>
                    )}
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
                        authOnly={isAuth || undefined}
                      />
                    </div>
                  </>
                )}

                {/* Step 2: Content */}
                {step === 2 && isAuth && (
                  <>
                    <Alert>
                      <WarningCircle className="w-4 h-4" />
                      <AlertDescription>
                        O texto de templates de autenticação é definido pela Meta. Configure apenas as opções abaixo.
                      </AlertDescription>
                    </Alert>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="authSecurity"
                        checked={authSecurity}
                        onCheckedChange={(v) => setAuthSecurity(v === true)}
                      />
                      <Label htmlFor="authSecurity">Adicionar aviso de segurança</Label>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="authExpiry">Validade do código (minutos)</Label>
                      <Input
                        id="authExpiry"
                        type="number"
                        min={1}
                        max={90}
                        value={Number.isNaN(authExpiry) ? '' : authExpiry}
                        onChange={(e) => setAuthExpiry(parseInt(e.target.value, 10))}
                        className={!authExpiryValid ? 'border-destructive' : ''}
                      />
                      {!authExpiryValid && (
                        <p className="text-xs text-destructive">Informe um número inteiro de 1 a 90.</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="authButtonText">Texto do botão</Label>
                      <Input
                        id="authButtonText"
                        value={authButtonText}
                        maxLength={25}
                        onChange={(e) => setAuthButtonText(e.target.value)}
                        className={!authButtonValid ? 'border-destructive' : ''}
                      />
                      <p className="text-xs text-muted-foreground text-right">{authButtonText.length}/25</p>
                    </div>
                  </>
                )}
                {step === 2 && !isAuth && (
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
                      {bodyStartsWithVariable && (
                        <Alert variant="destructive">
                           <WarningCircle className="w-4 h-4" />
                          <AlertDescription>
                            A mensagem não pode começar com uma variável. Adicione texto antes de {'{{1}}'}, por exemplo: <strong>Olá {'{{1}}'}, ...</strong>
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>

                    {/* Cabeçalho e rodapé (Meta) */}
                    {isMetaCreate && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label>Cabeçalho</Label>
                          <Select
                            value={headerFormat}
                            onValueChange={(v) => {
                              setHeaderFormat(v as MetaHeaderFormat);
                              setHeaderMediaUrl('');
                              setHeaderMediaName('');
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NONE">Sem cabeçalho</SelectItem>
                              <SelectItem value="TEXT">Texto</SelectItem>
                              <SelectItem value="IMAGE">Imagem</SelectItem>
                              <SelectItem value="VIDEO">Vídeo</SelectItem>
                              <SelectItem value="DOCUMENT">Documento (PDF)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {headerFormat === 'TEXT' && (
                          <div className="space-y-2">
                            <Input
                              value={header}
                              onChange={(e) => setHeader(e.target.value)}
                              placeholder="Pedido {{1}} confirmado"
                              maxLength={60}
                            />
                            <p className="text-xs text-muted-foreground">
                              Até 60 caracteres. Aceita uma variável, {'{{1}}'}.
                            </p>
                            {headerHasVar && (
                              <Input
                                value={headerExample}
                                onChange={(e) => setHeaderExample(e.target.value)}
                                placeholder="Exemplo para {{1}} (ex: 12345)"
                              />
                            )}
                          </div>
                        )}
                        {isMetaMediaHeader && (
                          <div className="space-y-2">
                            <Input
                              type="file"
                              accept={META_HEADER_MEDIA[headerFormat as 'IMAGE' | 'VIDEO' | 'DOCUMENT'].accept}
                              disabled={headerMediaUploading}
                              onChange={(e) => handleHeaderMediaFile(e.target.files?.[0])}
                            />
                            <p className="text-xs text-muted-foreground">
                              {headerMediaUploading
                                ? 'Enviando arquivo...'
                                : headerMediaUrl
                                ? `Arquivo de exemplo: ${headerMediaName}. Ele é enviado à Meta para aprovação e usado por padrão nos envios.`
                                : `Arquivo de exemplo (${META_HEADER_MEDIA[headerFormat as 'IMAGE' | 'VIDEO' | 'DOCUMENT'].label}).`}
                            </p>
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label htmlFor="footer">Rodapé</Label>
                          <Input
                            id="footer"
                            value={footer}
                            onChange={(e) => setFooter(e.target.value)}
                            placeholder="Opcional"
                            maxLength={60}
                          />
                        </div>
                      </div>
                    )}

                    {/* Quick Reply buttons */}
                    {(templateType === 'quick-reply' || (isMetaCreate && templateType === 'call-to-action')) && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>Botões de Resposta Rápida</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAddButton}
                            disabled={totalButtons >= 10}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Botão
                          </Button>
                        </div>
                        <Alert>
                           <WarningCircle className="w-4 h-4" />
                          <AlertDescription>
                            Títulos dos botões são fixos após aprovação pelo WhatsApp. Não são permitidos emojis, quebras de linha, variáveis ou caracteres de formatação (* _ ~ `).
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
                    {(templateType === 'call-to-action' || (isMetaCreate && templateType === 'quick-reply')) && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>Ações</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAddAction}
                            disabled={actions.length >= maxActions || totalButtons >= 10}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Ação
                          </Button>
                        </div>
                        <Alert>
                           <WarningCircle className="w-4 h-4" />
                          <AlertDescription>
                            {isMetaCreate
                              ? 'Máximo 2 links, 1 telefone e 1 copiar código (10 botões no total). O link aceita {{1}} só no final. Títulos não aceitam variáveis.'
                              : 'Máximo 2 URLs e 1 telefone. Títulos não aceitam variáveis.'}
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
                            {isMetaCreate && action.type === 'url' && action.value.includes('{{1}}') && (
                              <Input
                                placeholder="Exemplo para {{1}} (ex: pedido123)"
                                value={action.example || ''}
                                onChange={(e) => handleActionChange(index, 'example', e.target.value)}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Media URL */}
                    {templateType === 'media' && !isMetaCreate && (
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
                        <WarningCircle className="w-4 h-4" />
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

                {submitError && (
                  <Alert variant="destructive">
                    <WarningCircle className="w-4 h-4" />
                    <AlertDescription>{submitError}</AlertDescription>
                  </Alert>
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

                  {step < 3 && !(isAuth && step === 2) ? (
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
                      disabled={(isAuth ? !isStep2Valid : !isStep3Valid) || isSubmitting}
                    >
                      {isSubmitting ? (
                        <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FloppyDisk className="w-4 h-4 mr-2" />
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
                footer={footer}
                variables={variables}
                header={isMetaCreate ? (headerFormat === 'TEXT' ? header.replace('{{1}}', headerExample || '{{1}}') : '') : header}
                buttons={templateType === 'quick-reply' || (isMetaCreate && templateType === 'call-to-action') ? buttons : []}
                actions={templateType === 'call-to-action' || (isMetaCreate && templateType === 'quick-reply') ? actions : []}
                mediaUrl={isMetaCreate ? (headerFormat === 'IMAGE' ? headerMediaUrl || undefined : undefined) : templateType === 'media' ? mediaUrl : undefined}
                otp={isAuth ? { securityNotice: authSecurity, minutes: authExpiry, buttonText: authButtonText } : undefined}
              />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

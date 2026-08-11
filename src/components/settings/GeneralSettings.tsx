import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { SpinnerGap, TrashSimple, ImageSquare, PencilSimple, Copy, Check } from '@phosphor-icons/react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SimpleLogoUploader } from '@/components/settings/SimpleLogoUploader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function GeneralSettings() {
  const { organization, locale, refetch } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoSize, setLogoSize] = useState(40);
  const [copiedOrgId, setCopiedOrgId] = useState(false);
  const [cpfLookupEnabled, setCpfLookupEnabled] = useState(false);
  const [cpfPurpose, setCpfPurpose] = useState('');
  const [privacyNoticeConfirmed, setPrivacyNoticeConfirmed] = useState(false);

  const handleCopyOrgId = async () => {
    if (!organization?.id) return;
    try {
      await navigator.clipboard.writeText(organization.id);
      setCopiedOrgId(true);
      toast({ title: 'Organization ID copiado' });
      setTimeout(() => setCopiedOrgId(false), 2000);
    } catch {
      toast({ variant: 'destructive', title: 'Falha ao copiar' });
    }
  };
  const [formData, setFormData] = useState({
    name: '',
    default_currency: 'BRL',
    default_locale: 'pt-BR',
    operating_country_code: '' as '' | 'BR' | 'US',
    timezone: 'America/Sao_Paulo',
    enable_companies_module: false,
  });

  // Sync form data when organization loads
  useEffect(() => {
    if (organization) {
      setFormData({
        name: organization.name || '',
        default_currency: organization.default_currency || 'BRL',
        default_locale: organization.default_locale || 'pt-BR',
        operating_country_code: organization.operating_country_code || '',
        timezone: organization.timezone || 'America/Sao_Paulo',
        enable_companies_module: organization.enable_companies_module || false,
      });
      setLogoUrl(organization.logo_url || '');
      setLogoSize((organization as any).logo_size || 40);
    }
  }, [organization]);

  useEffect(() => {
    if (!organization?.id) return;
    void (async () => {
      const { data } = await supabase
        .from('registry_provider_settings')
        .select('cpf_lookup_enabled, documented_purpose, privacy_notice_updated_at')
        .eq('organization_id', organization.id)
        .maybeSingle();
      setCpfLookupEnabled(data?.cpf_lookup_enabled === true);
      setCpfPurpose(data?.documented_purpose || '');
      setPrivacyNoticeConfirmed(Boolean(data?.privacy_notice_updated_at));
    })();
  }, [organization?.id]);

  const handleLogoSave = async (newLogoUrl: string, newSize: number) => {
    if (!organization?.id) return;
    
    const { error } = await supabase
      .from('organizations')
      .update({ logo_url: newLogoUrl, logo_size: newSize })
      .eq('id', organization.id);
      
    if (error) throw error;
    
    setLogoUrl(newLogoUrl);
    setLogoSize(newSize);
    toast({ 
      title: t('common.success'),
      description: t('settings.logoUpdated'),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;

    setLoading(true);
    try {
      if (!formData.operating_country_code) {
        throw new Error('Escolha o país operacional da organização.');
      }
      let backfillJobId: string | null = null;
      if (formData.operating_country_code !== organization.operating_country_code) {
        const { data: countryResult, error: countryError } = await supabase.rpc('rpc_set_operating_country', {
          p_organization_id: organization.id,
          p_country_code: formData.operating_country_code,
        });
        if (countryError) throw countryError;
        backfillJobId = (countryResult as { backfill_job_id?: string | null } | null)?.backfill_job_id ?? null;
      }

      const {
        operating_country_code: _operatingCountryCode,
        ...organizationData
      } = formData;
      const { error } = await supabase
        .from('organizations')
        .update(organizationData)
        .eq('id', organization.id);

      if (error) throw error;
      if (formData.operating_country_code === 'BR') {
        const { error: providerError } = await supabase.rpc('rpc_configure_cpf_registry', {
          p_organization_id: organization.id,
          p_enabled: cpfLookupEnabled,
          p_documented_purpose: cpfPurpose || null,
          p_privacy_notice_confirmed: privacyNoticeConfirmed,
        });
        if (providerError) throw providerError;
      }

      toast({
        title: t('common.success'),
        description: backfillJobId
          ? 'Configuração salva. A revisão dos CPFs existentes foi colocada na fila segura.'
          : t('settings.orgUpdated'),
      });
      if (formData.operating_country_code === 'BR' && cpfLookupEnabled) {
        // Inicia ou retoma um lote curto. Isso também cobre organizações que
        // já eram BR antes de o provedor de CPF ser habilitado.
        void supabase.functions.invoke('registry-backfill', {
          body: {
            organization_id: organization.id,
            ...(backfillJobId ? { job_id: backfillJobId } : {}),
            limit: 20,
          },
        });
      }
      await refetch();
    } catch (error) {
      console.error('Error updating organization:', error);
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: 'Failed to update organization',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.general')}</CardTitle>
        <CardDescription>Manage your organization settings</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identidade da Organização */}
          <div className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Identidade da Organização</Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-id" className="text-xs text-muted-foreground">Organization ID</Label>
              <div className="flex gap-2">
                <Input
                  id="org-id"
                  value={organization?.id || ''}
                  readOnly
                  className="font-mono text-xs bg-muted"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="outline" size="icon" onClick={handleCopyOrgId}>
                        {copiedOrgId ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Use este identificador para conectar esta organização a sistemas externos.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>

          {/* Logo Section */}
          <div className="space-y-2">
            <Label>{t('settings.organizationLogo')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.logoDescription')}
            </p>
            <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo da organização"
                  style={{ height: logoSize }}
                  className="object-contain bg-background rounded p-1"
                />
              ) : (
                <div 
                  className="rounded-lg bg-primary flex items-center justify-center"
                  style={{ width: logoSize, height: logoSize }}
                >
                  <ImageSquare className="w-1/2 h-1/2 text-primary-foreground" />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLogoDialogOpen(true)}
                >
                  <PencilSimple className="w-4 h-4 mr-2" />
                  {t('settings.changeLogo')}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t('settings.logoSize')}: {logoSize}px
                </span>
              </div>
            </div>
          </div>

          {formData.operating_country_code === 'BR' && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="cpf-registry-enabled">Consulta automática de CPF</Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Usa a cpf-brasil.org somente pelo backend. A ativação exige finalidade legítima
                    documentada e política de privacidade atualizada.
                  </p>
                </div>
                <Switch
                  id="cpf-registry-enabled"
                  checked={cpfLookupEnabled}
                  onCheckedChange={setCpfLookupEnabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpf-purpose">Finalidade documentada</Label>
                <Input
                  id="cpf-purpose"
                  value={cpfPurpose}
                  onChange={(event) => setCpfPurpose(event.target.value)}
                  placeholder="Ex.: validação cadastral de clientes antes da contratação"
                  disabled={!cpfLookupEnabled}
                />
                <p className="text-xs text-muted-foreground">Mínimo de 20 caracteres.</p>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-md bg-muted/50 p-3">
                <Label htmlFor="privacy-confirmed" className="font-normal">
                  Confirmo que a política de privacidade informa esta consulta e sua finalidade.
                </Label>
                <Switch
                  id="privacy-confirmed"
                  checked={privacyNoticeConfirmed}
                  onCheckedChange={setPrivacyNoticeConfirmed}
                  disabled={!cpfLookupEnabled}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">{t('settings.orgName')}</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">{t('settings.defaultCurrency')}</Label>
            <Select
              value={formData.default_currency}
              onValueChange={(value) => setFormData({ ...formData, default_currency: value })}
            >
              <SelectTrigger id="currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BRL">BRL - Brazilian Real</SelectItem>
                <SelectItem value="USD">USD - US Dollar</SelectItem>
                <SelectItem value="EUR">EUR - Euro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="locale">{t('settings.defaultLocale')}</Label>
            <Select
              value={formData.default_locale}
              onValueChange={(value) => setFormData({ ...formData, default_locale: value })}
            >
              <SelectTrigger id="locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                <SelectItem value="en-US">English (US)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div>
              <Label htmlFor="operating-country">País operacional *</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Define o formato de nomes, endereços e documentos. Não altera o idioma da interface.
              </p>
            </div>
            <Select
              value={formData.operating_country_code}
              onValueChange={(value: 'BR' | 'US') =>
                setFormData({ ...formData, operating_country_code: value })
              }
            >
              <SelectTrigger id="operating-country">
                <SelectValue placeholder="Escolha Brasil ou Estados Unidos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BR">Brasil — Nome completo, CPF, CNPJ e CEP</SelectItem>
                <SelectItem value="US">Estados Unidos — First Name, Last Name e ZIP</SelectItem>
              </SelectContent>
            </Select>
            {organization?.operating_country_code &&
              organization.operating_country_code !== formData.operating_country_code && (
                <p className="text-sm text-amber-700">
                  A alteração será auditada e poderá colocar cadastros incompatíveis em revisão.
                </p>
              )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">{t('settings.timezone')}</Label>
            <Select
              value={formData.timezone}
              onValueChange={(value) => setFormData({ ...formData, timezone: value })}
            >
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/Sao_Paulo">America/Sao_Paulo (BRT)</SelectItem>
                <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="companies">{t('settings.enableCompanies')}</Label>
              <p className="text-sm text-muted-foreground">
                Enable the companies module for B2B features
              </p>
            </div>
            <Switch
              id="companies"
              checked={formData.enable_companies_module}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, enable_companies_module: checked })
              }
            />
          </div>

          <Button type="submit" disabled={loading}>
            {loading && <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </form>

        {/* Sample Data Reset Section */}
        <div className="mt-8 pt-8 border-t">
          <h3 className="text-lg font-medium mb-2">{t('settings.sampleData')}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t('settings.sampleDataDescription')}
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={resetting}>
                 {resetting && <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />}
                 <TrashSimple className="mr-2 h-4 w-4" />
                {t('settings.resetSampleData')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('settings.resetSampleDataConfirm')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('settings.resetSampleDataWarning')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    if (!organization?.id) return;
                    setResetting(true);
                    try {
                      // Delete sample data from all tables
                      await Promise.all([
                        supabase.from('contacts').delete().eq('organization_id', organization.id).eq('is_sample', true),
                        supabase.from('opportunities').delete().eq('organization_id', organization.id).eq('is_sample', true),
                        supabase.from('tasks').delete().eq('organization_id', organization.id).eq('is_sample', true),
                        supabase.from('activities').delete().eq('organization_id', organization.id).eq('is_sample', true),
                        supabase.from('calls').delete().eq('organization_id', organization.id).eq('is_sample', true),
                        supabase.from('messages').delete().eq('organization_id', organization.id).eq('is_sample', true),
                        supabase.from('documents').delete().eq('organization_id', organization.id).eq('is_sample', true),
                      ]);
                      
                      toast({
                        title: t('common.success'),
                        description: t('settings.sampleDataDeleted'),
                      });
                    } catch (error) {
                      console.error('Error deleting sample data:', error);
                      toast({
                        variant: 'destructive',
                        title: t('common.error'),
                        description: t('settings.sampleDataError'),
                      });
                    } finally {
                      setResetting(false);
                    }
                  }}
                >
                  {t('common.confirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </div>
      </CardContent>

      {/* Simple Logo Uploader */}
      <SimpleLogoUploader
        open={logoDialogOpen}
        onOpenChange={setLogoDialogOpen}
        currentLogoUrl={logoUrl}
        currentSize={logoSize}
        onSave={handleLogoSave}
        organizationSlug={organization?.slug || 'org'}
      />
    </Card>
  );
}

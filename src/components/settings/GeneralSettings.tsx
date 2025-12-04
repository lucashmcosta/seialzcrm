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
import { Loader2, Trash2 } from 'lucide-react';
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
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    default_currency: 'BRL',
    default_locale: 'pt-BR',
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
        timezone: organization.timezone || 'America/Sao_Paulo',
        enable_companies_module: organization.enable_companies_module || false,
      });
    }
  }, [organization]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update(formData)
        .eq('id', organization.id);

      if (error) throw error;

      toast({
        title: t('common.success'),
        description: t('settings.orgUpdated'),
      });
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
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
                {resetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Trash2 className="mr-2 h-4 w-4" />
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
                        supabase.from('attachments').delete().eq('organization_id', organization.id).eq('is_sample', true),
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
    </Card>
  );
}

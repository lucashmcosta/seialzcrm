import { useState } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function DuplicatePreventionSettings() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    duplicate_check_mode: (organization as any)?.duplicate_check_mode || 'none',
    duplicate_enforce_block: (organization as any)?.duplicate_enforce_block || false,
  });

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
        description: 'Duplicate prevention settings updated',
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: 'Failed to update settings',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.duplicates')}</CardTitle>
        <CardDescription>Configure duplicate contact detection</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              We recommend using phone-based duplicate detection as it's more reliable than email.
              Many people have multiple email addresses, but phone numbers are typically unique.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="mode">{t('settings.duplicateMode')}</Label>
            <Select
              value={formData.duplicate_check_mode}
              onValueChange={(value) =>
                setFormData({ ...formData, duplicate_check_mode: value })
              }
            >
              <SelectTrigger id="mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('settings.duplicateNone')}</SelectItem>
                <SelectItem value="email">{t('settings.duplicateEmail')}</SelectItem>
                <SelectItem value="phone">{t('settings.duplicatePhone')} (Recommended)</SelectItem>
                <SelectItem value="email_or_phone">
                  {t('settings.duplicateEmailOrPhone')}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Choose how to check for duplicate contacts
            </p>
          </div>

          {formData.duplicate_check_mode !== 'none' && (
            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label htmlFor="enforce">{t('settings.duplicateEnforce')}</Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, creation will be blocked if a duplicate is found.
                  When disabled, a warning will be shown but creation will be allowed.
                </p>
              </div>
              <Switch
                id="enforce"
                checked={formData.duplicate_enforce_block}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, duplicate_enforce_block: checked })
                }
              />
            </div>
          )}

          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

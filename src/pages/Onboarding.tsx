import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { NameInput } from '@/components/NameInput';
import { Sparkles } from 'lucide-react';

export default function Onboarding() {
  const navigate = useNavigate();
  const { organization, userProfile, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const [contactData, setContactData] = useState({
    fullName: '',
    email: '',
    phone: '',
  });

  const [opportunityData, setOpportunityData] = useState({
    title: '',
    amount: '',
  });

  useEffect(() => {
    if (organization?.onboarding_step === 'completed') {
      navigate('/dashboard');
    }
  }, [organization, navigate]);

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !userProfile) return;

    setLoading(true);
    try {
      const { data: contact, error } = await supabase
        .from('contacts')
        .insert({
          organization_id: organization.id,
          full_name: contactData.fullName,
          first_name: contactData.fullName.split(' ')[0],
          last_name: contactData.fullName.split(' ').slice(1).join(' ') || null,
          email: contactData.email || null,
          phone: contactData.phone || null,
          owner_user_id: userProfile.id,
          is_sample: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Update organization onboarding step
      await supabase
        .from('organizations')
        .update({ onboarding_step: 'first_opportunity' })
        .eq('id', organization.id);

      // Create activity
      await supabase.from('activities').insert({
        organization_id: organization.id,
        contact_id: contact.id,
        activity_type: 'system',
        title: 'Contato criado',
        body: 'Este é um contato de exemplo criado durante o onboarding.',
        created_by_user_id: userProfile.id,
        is_sample: true,
      });

      setCurrentStep(2);
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !userProfile) return;

    setLoading(true);
    try {
      // Get the first sample contact
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('is_sample', true)
        .single();

      // Get the first pipeline stage
      const { data: stage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('type', 'custom')
        .order('order_index')
        .limit(1)
        .single();

      if (!contact || !stage) throw new Error('Setup incompleto');

      const { data: opportunity, error } = await supabase
        .from('opportunities')
        .insert({
          organization_id: organization.id,
          title: opportunityData.title,
          amount: parseFloat(opportunityData.amount) || 0,
          currency: organization.default_currency,
          contact_id: contact.id,
          pipeline_stage_id: stage.id,
          owner_user_id: userProfile.id,
          is_sample: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Update organization onboarding
      await supabase
        .from('organizations')
        .update({
          onboarding_step: 'completed',
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq('id', organization.id);

      // Create activity
      await supabase.from('activities').insert({
        organization_id: organization.id,
        contact_id: contact.id,
        opportunity_id: opportunity.id,
        activity_type: 'system',
        title: 'Oportunidade criada',
        body: 'Esta é uma oportunidade de exemplo criada durante o onboarding.',
        created_by_user_id: userProfile.id,
        is_sample: true,
      });

      toast({
        title: t('common.success'),
        description: 'Onboarding concluído com sucesso!',
      });

      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-primary rounded-lg flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">{t('onboarding.welcome')}</CardTitle>
          <CardDescription>{t('onboarding.letsGetStarted')}</CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 1 && (
            <form onSubmit={handleCreateContact} className="space-y-4">
              <h3 className="text-lg font-medium">{t('onboarding.createFirstContact')}</h3>
              
              <NameInput
                locale={locale as 'pt-BR' | 'en-US'}
                fullName={contactData.fullName}
                onFullNameChange={(value) => setContactData({ ...contactData, fullName: value })}
                required
              />

              <div className="space-y-2">
                <Label htmlFor="email">{t('contacts.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={contactData.email}
                  onChange={(e) => setContactData({ ...contactData, email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t('contacts.phone')}</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={contactData.phone}
                  onChange={(e) => setContactData({ ...contactData, phone: e.target.value })}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('common.loading') : t('common.next')}
              </Button>
            </form>
          )}

          {currentStep === 2 && (
            <form onSubmit={handleCreateOpportunity} className="space-y-4">
              <h3 className="text-lg font-medium">{t('onboarding.createFirstOpportunity')}</h3>
              
              <div className="space-y-2">
                <Label htmlFor="title">Título da oportunidade</Label>
                <Input
                  id="title"
                  type="text"
                  value={opportunityData.title}
                  onChange={(e) => setOpportunityData({ ...opportunityData, title: e.target.value })}
                  required
                  placeholder="Ex: Venda de produto X"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">{t('opportunities.amount')}</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={opportunityData.amount}
                  onChange={(e) => setOpportunityData({ ...opportunityData, amount: e.target.value })}
                  required
                  placeholder="0.00"
                />
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setCurrentStep(1)} className="flex-1">
                  {t('common.back')}
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? t('common.loading') : t('common.finish')}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
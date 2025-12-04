import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { NameInput } from '@/components/NameInput';
import { Sparkles, Mail, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function Onboarding() {
  const navigate = useNavigate();
  const { organization, userProfile, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Step 0: Invites
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);

  // Step 1: Contact
  const [contactData, setContactData] = useState({
    fullName: '',
    email: '',
    phone: '',
  });

  // Step 2: Opportunity
  const [opportunityData, setOpportunityData] = useState({
    title: '',
    amount: '',
  });

  useEffect(() => {
    if (organization?.onboarding_step === 'completed') {
      navigate('/dashboard');
    } else if (organization?.onboarding_step === 'first_contact') {
      setCurrentStep(1);
    } else if (organization?.onboarding_step === 'first_opportunity') {
      setCurrentStep(2);
    }
  }, [organization, navigate]);

  const handleSendInvites = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !userProfile) return;

    setLoading(true);
    try {
      // Send invitations
      if (invitedEmails.length > 0) {
        const invitations = invitedEmails.map(email => ({
          organization_id: organization.id,
          email,
          invited_by_user_id: userProfile.id,
          token: crypto.randomUUID(),
          status: 'pending',
        }));

        const { error } = await supabase
          .from('invitations')
          .insert(invitations);

        if (error) throw error;
      }

      // Update onboarding step
      await supabase
        .from('organizations')
        .update({ onboarding_step: 'first_contact' })
        .eq('id', organization.id);

      setCurrentStep(1);
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

  const handleAddEmail = () => {
    if (!inviteEmail) return;
    
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      toast({
        title: t('common.error'),
        description: t('onboarding.invalidEmail'),
        variant: 'destructive',
      });
      return;
    }

    if (invitedEmails.includes(inviteEmail)) {
      toast({
        title: t('common.error'),
        description: t('onboarding.emailAlreadyAdded'),
        variant: 'destructive',
      });
      return;
    }

    setInvitedEmails([...invitedEmails, inviteEmail]);
    setInviteEmail('');
  };

  const handleRemoveEmail = (email: string) => {
    setInvitedEmails(invitedEmails.filter(e => e !== email));
  };

  const handleSkipInvites = async () => {
    if (!organization) return;

    await supabase
      .from('organizations')
      .update({ onboarding_step: 'first_contact' })
      .eq('id', organization.id);

    setCurrentStep(1);
  };

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

      await supabase
        .from('organizations')
        .update({ onboarding_step: 'first_opportunity' })
        .eq('id', organization.id);

      await supabase.from('activities').insert({
        organization_id: organization.id,
        contact_id: contact.id,
        activity_type: 'system',
        title: t('onboarding.contactCreated'),
        body: t('onboarding.sampleContactNote'),
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
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('is_sample', true)
        .single();

      const { data: stage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('type', 'custom')
        .order('order_index')
        .limit(1)
        .single();

      if (!contact || !stage) throw new Error(t('onboarding.setupIncomplete'));

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

      await supabase
        .from('organizations')
        .update({
          onboarding_step: 'completed',
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq('id', organization.id);

      await supabase.from('activities').insert({
        organization_id: organization.id,
        contact_id: contact.id,
        opportunity_id: opportunity.id,
        activity_type: 'system',
        title: t('onboarding.opportunityCreated'),
        body: t('onboarding.sampleOpportunityNote'),
        created_by_user_id: userProfile.id,
        is_sample: true,
      });

      toast({
        title: t('common.success'),
        description: t('onboarding.completed'),
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
          <CardDescription>
            {currentStep === 0 && t('onboarding.inviteTeamDescription')}
            {currentStep === 1 && t('onboarding.createFirstContactDescription')}
            {currentStep === 2 && t('onboarding.createFirstOpportunityDescription')}
          </CardDescription>
          
          {/* Progress indicator */}
          <div className="flex justify-center gap-2 mt-4">
            {[0, 1, 2].map(step => (
              <div
                key={step}
                className={`h-2 w-16 rounded-full transition-colors ${
                  step === currentStep ? 'bg-primary' :
                  step < currentStep ? 'bg-primary/50' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {currentStep === 0 && (
            <form onSubmit={handleSendInvites} className="space-y-4">
              <h3 className="text-lg font-medium">{t('onboarding.inviteYourTeam')}</h3>
              
              <div className="space-y-2">
                <Label htmlFor="inviteEmail">{t('settings.email')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="inviteEmail"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder={t('onboarding.emailPlaceholder')}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddEmail();
                      }
                    }}
                  />
                  <Button type="button" onClick={handleAddEmail} variant="secondary">
                    <Mail className="w-4 h-4 mr-2" />
                    {t('onboarding.addEmail')}
                  </Button>
                </div>
              </div>

              {invitedEmails.length > 0 && (
                <div className="space-y-2">
                  <Label>{t('onboarding.invitedEmails')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {invitedEmails.map(email => (
                      <Badge key={email} variant="secondary" className="flex items-center gap-1">
                        {email}
                        <X
                          className="w-3 h-3 cursor-pointer"
                          onClick={() => handleRemoveEmail(email)}
                        />
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button type="button" variant="outline" onClick={handleSkipInvites} className="flex-1">
                  {t('onboarding.skipForNow')}
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? t('common.loading') : t('common.next')}
                </Button>
              </div>
            </form>
          )}

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
                <PhoneInput
                  id="phone"
                  value={contactData.phone}
                  onChange={(e164) => setContactData({ ...contactData, phone: e164 })}
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
                <Label htmlFor="title">{t('opportunities.name')}</Label>
                <Input
                  id="title"
                  type="text"
                  value={opportunityData.title}
                  onChange={(e) => setOpportunityData({ ...opportunityData, title: e.target.value })}
                  required
                  placeholder={t('onboarding.opportunityPlaceholder')}
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

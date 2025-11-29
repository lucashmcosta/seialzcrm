import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Contact {
  id: string;
  full_name: string;
}

interface PipelineStage {
  id: string;
  name: string;
}

interface Opportunity {
  id?: string;
  title: string;
  amount: number;
  currency: string;
  contact_id: string | null;
  pipeline_stage_id: string;
  close_date: string | null;
}

interface OpportunityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity?: Opportunity | null;
  stages: PipelineStage[];
  onSuccess: () => void;
}

export function OpportunityDialog({ open, onOpenChange, opportunity, stages, onSuccess }: OpportunityDialogProps) {
  const { organization, locale, userProfile } = useOrganization();
  const { t } = useTranslation(locale as any);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Opportunity>({
    title: '',
    amount: 0,
    currency: organization?.default_currency || 'BRL',
    contact_id: null,
    pipeline_stage_id: stages[0]?.id || '',
    close_date: null,
  });

  useEffect(() => {
    if (opportunity) {
      setFormData(opportunity);
    } else {
      setFormData({
        title: '',
        amount: 0,
        currency: organization?.default_currency || 'BRL',
        contact_id: null,
        pipeline_stage_id: stages[0]?.id || '',
        close_date: null,
      });
    }
  }, [opportunity, organization, stages]);

  useEffect(() => {
    if (open && organization?.id) {
      fetchContacts();
    }
  }, [open, organization?.id]);

  const fetchContacts = async () => {
    if (!organization?.id) return;

    const { data } = await supabase
      .from('contacts')
      .select('id, full_name')
      .eq('organization_id', organization.id)
      .is('deleted_at', null)
      .order('full_name');

    if (data) {
      setContacts(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !userProfile?.id) return;

    setSubmitting(true);
    try {
      if (opportunity?.id) {
        // Update existing opportunity
        const { error } = await supabase
          .from('opportunities')
          .update({
            title: formData.title,
            amount: formData.amount,
            currency: formData.currency,
            contact_id: formData.contact_id,
            pipeline_stage_id: formData.pipeline_stage_id,
            close_date: formData.close_date,
          })
          .eq('id', opportunity.id);

        if (error) throw error;
        toast.success(t('opportunities.updated'));
      } else {
        // Create new opportunity
        const { error } = await supabase
          .from('opportunities')
          .insert({
            organization_id: organization.id,
            owner_user_id: userProfile.id,
            title: formData.title,
            amount: formData.amount,
            currency: formData.currency,
            contact_id: formData.contact_id,
            pipeline_stage_id: formData.pipeline_stage_id,
            close_date: formData.close_date,
            status: 'open',
          });

        if (error) throw error;
        toast.success(t('opportunities.created'));
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving opportunity:', error);
      toast.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {opportunity ? t('opportunities.editOpportunity') : t('opportunities.newOpportunity')}
            </DialogTitle>
            <DialogDescription>
              {opportunity ? 'Edite os detalhes da oportunidade' : 'Crie uma nova oportunidade no pipeline'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('opportunities.title')}</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder="Ex: Venda de software"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">{t('opportunities.amount')}</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">{t('opportunities.currency')}</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData({ ...formData, currency: value })}
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">BRL</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stage">{t('opportunities.stage')}</Label>
              <Select
                value={formData.pipeline_stage_id}
                onValueChange={(value) => setFormData({ ...formData, pipeline_stage_id: value })}
              >
                <SelectTrigger id="stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact">{t('opportunities.contact')}</Label>
              <Select
                value={formData.contact_id || 'none'}
                onValueChange={(value) => setFormData({ ...formData, contact_id: value === 'none' ? null : value })}
              >
                <SelectTrigger id="contact">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem contato</SelectItem>
                  {contacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="close_date">{t('opportunities.closeDate')}</Label>
              <Input
                id="close_date"
                type="date"
                value={formData.close_date || ''}
                onChange={(e) => setFormData({ ...formData, close_date: e.target.value || null })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

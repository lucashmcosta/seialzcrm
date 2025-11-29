import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { NameInput } from '@/components/NameInput';

export default function ContactForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { organization, userProfile, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const isEdit = !!id;

  const [formData, setFormData] = useState({
    full_name: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    company_name: '',
    lifecycle_stage: 'lead' as 'lead' | 'customer' | 'inactive',
    do_not_contact: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit) {
      fetchContact();
    }
  }, [id]);

  const fetchContact = async () => {
    if (!organization || !id) return;

    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organization.id)
      .maybeSingle();

    if (data) {
      setFormData({
        full_name: data.full_name || '',
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        email: data.email || '',
        phone: data.phone || '',
        company_name: data.company_name || '',
        lifecycle_stage: data.lifecycle_stage || 'lead',
        do_not_contact: data.do_not_contact || false,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !userProfile) return;

    setLoading(true);

    const contactData = {
      ...formData,
      organization_id: organization.id,
      owner_user_id: userProfile.id,
    };

    if (isEdit) {
      const { error } = await supabase
        .from('contacts')
        .update(contactData)
        .eq('id', id);

      if (error) {
        toast.error(t('common.error'));
        setLoading(false);
        return;
      }

      toast.success(t('contacts.updated'));
      navigate(`/contacts/${id}`);
    } else {
      const { data, error } = await supabase
        .from('contacts')
        .insert(contactData)
        .select()
        .single();

      if (error) {
        toast.error(t('common.error'));
        setLoading(false);
        return;
      }

      toast.success(t('contacts.created'));
      navigate(`/contacts/${data.id}`);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="border-b bg-background/95 backdrop-blur">
          <div className="flex items-center gap-4 px-6 py-4">
            <Link to={isEdit ? `/contacts/${id}` : '/contacts'}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-foreground">
              {isEdit ? t('contacts.editContact') : t('contacts.newContact')}
            </h1>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <Card className="max-w-2xl mx-auto p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <NameInput
                locale={locale as any}
                fullName={formData.full_name}
                firstName={formData.first_name}
                lastName={formData.last_name}
                onFullNameChange={(value) => setFormData({ ...formData, full_name: value })}
                onFirstNameChange={(value) => setFormData({ ...formData, first_name: value })}
                onLastNameChange={(value) => setFormData({ ...formData, last_name: value })}
              />

              <div>
                <Label htmlFor="email">{t('contacts.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="phone">{t('contacts.phone')}</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="company">{t('contacts.company')}</Label>
                <Input
                  id="company"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="lifecycle">{t('contacts.lifecycleStage')}</Label>
                <Select
                  value={formData.lifecycle_stage}
                  onValueChange={(value: any) => setFormData({ ...formData, lifecycle_stage: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">{t('lifecycle.lead')}</SelectItem>
                    <SelectItem value="customer">{t('lifecycle.customer')}</SelectItem>
                    <SelectItem value="inactive">{t('lifecycle.inactive')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="doNotContact"
                  checked={formData.do_not_contact}
                  onCheckedChange={(checked) => 
                    setFormData({ ...formData, do_not_contact: checked as boolean })
                  }
                />
                <Label htmlFor="doNotContact">{t('contacts.doNotContact')}</Label>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {loading ? t('common.loading') : t('common.save')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(isEdit ? `/contacts/${id}` : '/contacts')}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

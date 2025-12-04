import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';

export default function CompanyForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    phone: '',
    address: ''
  });

  useEffect(() => {
    if (isEdit && id) {
      fetchCompany();
    }
  }, [id, isEdit]);

  const fetchCompany = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      setFormData({
        name: data.name || '',
        domain: data.domain || '',
        phone: data.phone || '',
        address: data.address || ''
      });
    } catch (error) {
      console.error('Error fetching company:', error);
      toast.error(t('common.error'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;

    setLoading(true);

    try {
      const companyData = {
        ...formData,
        organization_id: organization.id,
        domain: formData.domain || null,
        phone: formData.phone || null,
        address: formData.address || null
      };

      if (isEdit && id) {
        const { error } = await supabase
          .from('companies')
          .update(companyData)
          .eq('id', id);

        if (error) throw error;
        toast.success(t('companies.updated'));
      } else {
        const { error } = await supabase
          .from('companies')
          .insert([companyData]);

        if (error) throw error;
        toast.success(t('companies.created'));
      }

      navigate('/companies');
    } catch (error) {
      console.error('Error saving company:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="p-6">
        <Link to={isEdit ? `/companies/${id}` : '/companies'}>
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('common.back')}
          </Button>
        </Link>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">
            {isEdit ? t('companies.editCompany') : t('companies.newCompany')}
          </h1>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="name">{t('companies.name')} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="domain">{t('companies.domain')}</Label>
              <Input
                id="domain"
                type="text"
                placeholder="exemplo.com.br"
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="phone">{t('companies.phone')}</Label>
              <PhoneInput
                id="phone"
                value={formData.phone}
                onChange={(e164) => setFormData({ ...formData, phone: e164 })}
              />
            </div>

            <div>
              <Label htmlFor="address">{t('companies.address')}</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? t('common.loading') : t('common.save')}
              </Button>
              <Link to={isEdit ? `/companies/${id}` : '/companies'}>
                <Button type="button" variant="outline">
                  {t('common.cancel')}
                </Button>
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </Layout>
  );
}

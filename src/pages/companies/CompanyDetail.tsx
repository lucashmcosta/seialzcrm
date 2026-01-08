import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Building2, Edit, Trash2, ArrowLeft, Users, Briefcase } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/base/buttons/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';

interface Company {
  id: string;
  name: string;
  domain: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

interface Contact {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
}

interface Opportunity {
  id: string;
  title: string;
  amount: number | null;
  pipeline_stage_id: string;
  pipeline_stages: { name: string };
}

export default function CompanyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id && organization?.id) {
      fetchCompanyData();
    }
  }, [id, organization?.id]);

  const fetchCompanyData = async () => {
    if (!id || !organization?.id) return;

    try {
      const [companyResult, contactsResult, oppsResult] = await Promise.all([
        supabase.from('companies').select('*').eq('id', id).single(),
        supabase.from('contacts').select('id, full_name, email, phone').eq('company_id', id),
        supabase.from('opportunities').select('id, title, amount, pipeline_stage_id, pipeline_stages(name)').eq('company_id', id)
      ]);

      if (companyResult.error) throw companyResult.error;
      
      setCompany(companyResult.data);
      setContacts(contactsResult.data || []);
      setOpportunities(oppsResult.data || []);
    } catch (error) {
      console.error('Error fetching company:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;

    try {
      const { error } = await supabase
        .from('companies')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      toast.success(t('companies.deleted'));
      navigate('/companies');
    } catch (error) {
      console.error('Error deleting company:', error);
      toast.error(t('common.error'));
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6 text-center">{t('common.loading')}</div>
      </Layout>
    );
  }

  if (!company) {
    return (
      <Layout>
        <div className="p-6 text-center">{t('companies.notFound')}</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <Link to="/companies">
            <Button color="ghost" size="sm" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('common.back')}
            </Button>
          </Link>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">{company.name}</h1>
                {company.domain && (
                  <p className="text-muted-foreground">{company.domain}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Link to={`/companies/${id}/edit`}>
                <Button color="secondary" size="md">
                  <Edit className="w-4 h-4 mr-2" />
                  {t('common.edit')}
                </Button>
              </Link>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button color="destructive" size="md">
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t('common.delete')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('companies.deleteConfirm')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('companies.deleteWarning')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>
                      {t('common.delete')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('companies.details')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-sm text-muted-foreground">{t('companies.phone')}</span>
                <p className="font-medium">{company.phone || '-'}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">{t('companies.address')}</span>
                <p className="font-medium">{company.address || '-'}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">{t('companies.created')}</span>
                <p className="font-medium">
                  {new Date(company.created_at).toLocaleDateString(locale)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                {t('companies.linkedContacts')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('contacts.noContacts')}</p>
              ) : (
                <ul className="space-y-2">
                  {contacts.map((contact) => (
                    <li key={contact.id}>
                      <Link 
                        to={`/contacts/${contact.id}`}
                        className="text-primary hover:underline"
                      >
                        {contact.full_name}
                      </Link>
                      {contact.email && (
                        <p className="text-xs text-muted-foreground">{contact.email}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="w-5 h-5" />
                {t('companies.linkedOpportunities')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {opportunities.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('opportunities.noOpportunities')}</p>
              ) : (
                <ul className="space-y-2">
                  {opportunities.map((opp) => (
                    <li key={opp.id}>
                      <Link 
                        to={`/opportunities/${opp.id}`}
                        className="text-primary hover:underline"
                      >
                        {opp.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {opp.pipeline_stages.name}
                        {opp.amount && ` • ${opp.amount.toLocaleString(locale, { style: 'currency', currency: organization?.default_currency || 'BRL' })}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

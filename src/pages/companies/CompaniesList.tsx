import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Plus, Search } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';

interface Company {
  id: string;
  name: string;
  domain: string | null;
  phone: string | null;
  created_at: string;
  contacts_count?: number;
  opportunities_count?: number;
}

export default function CompaniesList() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (organization?.id) {
      fetchCompanies();
    }
  }, [organization?.id]);

  const fetchCompanies = async () => {
    if (!organization?.id) return;

    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('organization_id', organization.id)
        .order('name');

      if (error) throw error;

      // Fetch counts for each company
      const companiesWithCounts = await Promise.all(
        (data || []).map(async (company) => {
          const [contactsResult, oppsResult] = await Promise.all([
            supabase
              .from('contacts')
              .select('id', { count: 'exact', head: true })
              .eq('company_id', company.id),
            supabase
              .from('opportunities')
              .select('id', { count: 'exact', head: true })
              .eq('company_id', company.id)
          ]);

          return {
            ...company,
            contacts_count: contactsResult.count || 0,
            opportunities_count: oppsResult.count || 0
          };
        })
      );

      setCompanies(companiesWithCounts);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const filteredCompanies = companies.filter(company =>
    company.name.toLowerCase().includes(search.toLowerCase()) ||
    company.domain?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('companies.title')}</h1>
            <p className="text-muted-foreground mt-1">{t('companies.manageCompanies')}</p>
          </div>
          <Link to="/companies/new">
            <Button color="primary" size="md">
              <Plus className="w-4 h-4 mr-2" />
              {t('companies.newCompany')}
            </Button>
          </Link>
        </div>

        <Card className="p-6">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('common.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
          ) : filteredCompanies.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">{t('companies.noCompanies')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('companies.name')}</TableHead>
                  <TableHead>{t('companies.domain')}</TableHead>
                  <TableHead>{t('companies.phone')}</TableHead>
                  <TableHead className="text-right">{t('companies.linkedContacts')}</TableHead>
                  <TableHead className="text-right">{t('companies.linkedOpportunities')}</TableHead>
                  <TableHead>{t('companies.created')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell>
                      <Link 
                        to={`/companies/${company.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {company.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{company.domain || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{company.phone || '-'}</TableCell>
                    <TableCell className="text-right">{company.contacts_count}</TableCell>
                    <TableCell className="text-right">{company.opportunities_count}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(company.created_at).toLocaleDateString(locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </Layout>
  );
}

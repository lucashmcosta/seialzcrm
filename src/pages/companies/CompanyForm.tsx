import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';
import { useRegistryLookup } from '@/hooks/useRegistryLookup';
import { digits, formatCep, isValidCnpj, normalizeCnpj } from '@/lib/regional';

interface CnpjLookupData {
  cnpj?: string;
  legal_name?: string;
  trade_name?: string;
  registration_status?: string;
  opened_at?: string;
  legal_nature?: string;
  company_size?: string;
  primary_cnae_code?: string;
  primary_cnae_description?: string;
  email?: string;
  phone?: string;
  address?: {
    postal_code?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    region?: string;
    country_code?: string;
  };
}

interface CepLookupData {
  postal_code?: string;
  street?: string;
  neighborhood?: string;
  city?: string;
  region?: string;
  country_code?: string;
}

export default function CompanyForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const { lookup, isBrazil } = useRegistryLookup();
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    phone: '',
    email: '',
    address: '',
    cnpj: '',
    legal_name: '',
    trade_name: '',
    registration_status: '',
    opened_at: '',
    legal_nature: '',
    company_size: '',
    primary_cnae_code: '',
    primary_cnae_description: '',
    address_street: '',
    address_number: '',
    address_complement: '',
    address_neighborhood: '',
    address_city: '',
    address_state: '',
    address_zip: '',
    address_country_code: '',
  });
  const [cnpjLookupLoading, setCnpjLookupLoading] = useState(false);
  const [cnpjPreview, setCnpjPreview] = useState<CnpjLookupData | null>(null);
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [cepPreview, setCepPreview] = useState<CepLookupData | null>(null);

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
        email: data.email || '',
        address: data.address || '',
        cnpj: data.cnpj || '',
        legal_name: data.legal_name || '',
        trade_name: data.trade_name || '',
        registration_status: data.registration_status || '',
        opened_at: data.opened_at || '',
        legal_nature: data.legal_nature || '',
        company_size: data.company_size || '',
        primary_cnae_code: data.primary_cnae_code || '',
        primary_cnae_description: data.primary_cnae_description || '',
        address_street: data.address_street || '',
        address_number: data.address_number || '',
        address_complement: data.address_complement || '',
        address_neighborhood: data.address_neighborhood || '',
        address_city: data.address_city || '',
        address_state: data.address_state || '',
        address_zip: organization?.operating_country_code === 'BR'
          ? formatCep(data.address_zip)
          : data.address_zip || '',
        address_country_code: data.address_country_code || organization?.operating_country_code || '',
      });
    } catch (error) {
      console.error('Error fetching company:', error);
      toast.error(t('common.error'));
    }
  };

  const lookupCnpj = async () => {
    if (!isBrazil || cnpjLookupLoading) return;
    const cnpj = normalizeCnpj(formData.cnpj);
    if (!cnpj) return;
    if (!isValidCnpj(cnpj)) {
      toast.error('Informe um CNPJ válido.');
      return;
    }

    let duplicateQuery = supabase
      .from('companies')
      .select('id, name, cnpj')
      .eq('organization_id', organization!.id)
      .is('deleted_at', null);
    if (id) duplicateQuery = duplicateQuery.neq('id', id);
    const { data: candidates } = await duplicateQuery;
    const duplicate = candidates?.find((item) => normalizeCnpj(item.cnpj) === cnpj);
    if (duplicate) {
      toast.error(`Este CNPJ já pertence a ${duplicate.name}.`);
      navigate(`/companies/${duplicate.id}`);
      return;
    }

    setCnpjLookupLoading(true);
    try {
      const result = await lookup<CnpjLookupData>('cnpj', cnpj);
      setCnpjPreview(result.data || null);
    } catch {
      toast.error('Não foi possível consultar o CNPJ agora.');
    } finally {
      setCnpjLookupLoading(false);
    }
  };

  const applyCnpjPreview = () => {
    if (!cnpjPreview) return;
    const address = cnpjPreview.address || {};
    setFormData((current) => ({
      ...current,
      cnpj: normalizeCnpj(cnpjPreview.cnpj || current.cnpj),
      name: cnpjPreview.trade_name || cnpjPreview.legal_name || current.name,
      legal_name: cnpjPreview.legal_name || current.legal_name,
      trade_name: cnpjPreview.trade_name || current.trade_name,
      registration_status: cnpjPreview.registration_status || current.registration_status,
      opened_at: cnpjPreview.opened_at || current.opened_at,
      legal_nature: cnpjPreview.legal_nature || current.legal_nature,
      company_size: cnpjPreview.company_size || current.company_size,
      primary_cnae_code: cnpjPreview.primary_cnae_code || current.primary_cnae_code,
      primary_cnae_description: cnpjPreview.primary_cnae_description || current.primary_cnae_description,
      email: cnpjPreview.email || current.email,
      phone: cnpjPreview.phone || current.phone,
      address_zip: isBrazil
        ? formatCep(address.postal_code || current.address_zip)
        : address.postal_code || current.address_zip,
      address_street: address.street || current.address_street,
      address_number: address.number || current.address_number,
      address_complement: address.complement || current.address_complement,
      address_neighborhood: address.neighborhood || current.address_neighborhood,
      address_city: address.city || current.address_city,
      address_state: address.region || current.address_state,
      address_country_code: address.country_code || 'BR',
    }));
    setCnpjPreview(null);
  };

  const lookupCep = async () => {
    if (!isBrazil || cepLookupLoading) return;
    const cep = digits(formData.address_zip);
    if (!cep) return;
    if (cep.length !== 8) {
      toast.error('Informe um CEP com 8 dígitos.');
      return;
    }
    setCepLookupLoading(true);
    try {
      const result = await lookup<CepLookupData>('cep', cep);
      setCepPreview(result.data || null);
    } catch {
      toast.error('Não foi possível consultar o CEP agora.');
    } finally {
      setCepLookupLoading(false);
    }
  };

  const applyCepPreview = () => {
    if (!cepPreview) return;
    setFormData((current) => ({
      ...current,
      address_zip: formatCep(cepPreview.postal_code || current.address_zip),
      address_street: cepPreview.street || current.address_street,
      address_neighborhood: cepPreview.neighborhood || current.address_neighborhood,
      address_city: cepPreview.city || current.address_city,
      address_state: cepPreview.region || current.address_state,
      address_country_code: cepPreview.country_code || 'BR',
    }));
    setCepPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;
    if (!organization.operating_country_code) {
      toast.error('Escolha o país operacional antes de salvar empresas.');
      return;
    }

    setLoading(true);

    try {
      if (isBrazil && formData.cnpj && !isValidCnpj(formData.cnpj)) {
        throw new Error('invalid_cnpj');
      }
      const canonicalAddressZip = isBrazil
        ? digits(formData.address_zip)
        : formData.address_zip.trim();
      const companyData = {
        ...formData,
        organization_id: organization.id,
        cnpj: formData.cnpj ? normalizeCnpj(formData.cnpj) : null,
        domain: formData.domain || null,
        phone: formData.phone || null,
        email: formData.email || null,
        legal_name: formData.legal_name || null,
        trade_name: formData.trade_name || null,
        registration_status: formData.registration_status || null,
        opened_at: formData.opened_at || null,
        legal_nature: formData.legal_nature || null,
        company_size: formData.company_size || null,
        primary_cnae_code: formData.primary_cnae_code || null,
        primary_cnae_description: formData.primary_cnae_description || null,
        address_street: formData.address_street || null,
        address_number: formData.address_number || null,
        address_complement: formData.address_complement || null,
        address_neighborhood: formData.address_neighborhood || null,
        address_city: formData.address_city || null,
        address_state: formData.address_state || null,
        address_zip: canonicalAddressZip || null,
        address_country_code: formData.address_country_code || organization.operating_country_code,
        address: [
          formData.address_street,
          formData.address_number,
          formData.address_complement,
          formData.address_neighborhood,
          formData.address_city,
          formData.address_state,
          canonicalAddressZip,
        ].filter(Boolean).join(', ') || formData.address || null,
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
      const dbError = error as { code?: string; message?: string };
      if (dbError.message === 'invalid_cnpj') {
        toast.error('Corrija o CNPJ inválido antes de salvar.');
        return;
      }
      if (dbError.code === '23505' && String(dbError.message ?? '').toLowerCase().includes('cnpj')) {
        const canonical = normalizeCnpj(formData.cnpj);
        const { data: candidates } = await supabase
          .from('companies')
          .select('id, name, cnpj')
          .eq('organization_id', organization.id)
          .is('deleted_at', null);
        const duplicate = (candidates || []).find((item) => normalizeCnpj(item.cnpj) === canonical);
        toast.error('Este CNPJ já pertence a outra empresa.');
        if (duplicate?.id) navigate(`/companies/${duplicate.id}`);
        return;
      }
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  if (organization && !organization.operating_country_code) {
    return (
      <Layout>
        <div className="p-6">
          <Card className="mx-auto max-w-xl p-6">
            <h1 className="text-xl font-semibold">Escolha o país operacional</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              O padrão regional precisa ser definido antes de criar ou editar empresas.
            </p>
            <Button className="mt-4" color="primary" onClick={() => navigate('/settings/general')}>
              Abrir configurações
            </Button>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6">
        <Link to={isEdit ? `/companies/${id}` : '/companies'}>
          <Button color="ghost" size="sm" className="mb-4">
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
            {isBrazil && (
              <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div>
                  <Label htmlFor="cnpj">CNPJ</Label>
                  <Input
                    id="cnpj"
                    value={formData.cnpj}
                    onChange={(e) => {
                      setFormData({ ...formData, cnpj: e.target.value });
                      setCnpjPreview(null);
                    }}
                    onBlur={lookupCnpj}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void lookupCnpj();
                      }
                    }}
                    placeholder="00.000.000/0000-00"
                  />
                </div>
                {cnpjLookupLoading && <p className="text-sm text-muted-foreground">Consultando CNPJ…</p>}
                {cnpjPreview && (
                  <div className="rounded-md border bg-background p-3">
                    <p className="font-medium">
                      {cnpjPreview.trade_name || cnpjPreview.legal_name || 'Empresa encontrada'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[cnpjPreview.legal_name, cnpjPreview.registration_status]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <Button type="button" color="secondary" size="sm" className="mt-3" onClick={applyCnpjPreview}>
                      Aplicar dados da empresa
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="name">{t('companies.name')} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            {isBrazil && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="legal_name">Razão social</Label>
                  <Input
                    id="legal_name"
                    value={formData.legal_name}
                    onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="trade_name">Nome fantasia</Label>
                  <Input
                    id="trade_name"
                    value={formData.trade_name}
                    onChange={(e) => setFormData({ ...formData, trade_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="registration_status">Situação cadastral</Label>
                  <Input
                    id="registration_status"
                    value={formData.registration_status}
                    onChange={(e) => setFormData({ ...formData, registration_status: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="opened_at">Data de abertura</Label>
                  <Input
                    id="opened_at"
                    type="date"
                    value={formData.opened_at}
                    onChange={(e) => setFormData({ ...formData, opened_at: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="legal_nature">Natureza jurídica</Label>
                  <Input
                    id="legal_nature"
                    value={formData.legal_nature}
                    onChange={(e) => setFormData({ ...formData, legal_nature: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="company_size">Porte</Label>
                  <Input
                    id="company_size"
                    value={formData.company_size}
                    onChange={(e) => setFormData({ ...formData, company_size: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="primary_cnae">CNAE principal</Label>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-[180px_1fr]">
                    <Input
                      id="primary_cnae"
                      value={formData.primary_cnae_code}
                      onChange={(e) => setFormData({ ...formData, primary_cnae_code: e.target.value })}
                      placeholder="Código"
                    />
                    <Input
                      value={formData.primary_cnae_description}
                      onChange={(e) => setFormData({ ...formData, primary_cnae_description: e.target.value })}
                      placeholder="Descrição"
                    />
                  </div>
                </div>
              </div>
            )}

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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="phone">{t('companies.phone')}</Label>
                <PhoneInput
                  id="phone"
                  value={formData.phone}
                  onChange={(e164) => setFormData({ ...formData, phone: e164 })}
                />
              </div>
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="border-b pb-2 text-sm font-semibold">{t('companies.address')}</h2>
              <div className={`grid grid-cols-1 gap-4 ${isBrazil ? 'md:grid-cols-[1fr_140px]' : ''}`}>
                <div>
                  <Label htmlFor="address_street">{isBrazil ? 'Logradouro' : 'Street address'}</Label>
                  <Input
                    id="address_street"
                    value={formData.address_street}
                    onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                  />
                </div>
                {isBrazil && (
                  <div>
                    <Label htmlFor="address_number">Número</Label>
                    <Input
                      id="address_number"
                      value={formData.address_number}
                      onChange={(e) => setFormData({ ...formData, address_number: e.target.value })}
                    />
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="address_complement">{isBrazil ? 'Complemento' : 'Address line 2'}</Label>
                <Input
                  id="address_complement"
                  value={formData.address_complement}
                  onChange={(e) => setFormData({ ...formData, address_complement: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {isBrazil && (
                  <div>
                    <Label htmlFor="address_neighborhood">Bairro</Label>
                    <Input
                      id="address_neighborhood"
                      value={formData.address_neighborhood}
                      onChange={(e) => setFormData({ ...formData, address_neighborhood: e.target.value })}
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="address_city">{isBrazil ? 'Cidade' : 'City'}</Label>
                  <Input
                    id="address_city"
                    value={formData.address_city}
                    onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="address_state">{isBrazil ? 'Estado' : 'State'}</Label>
                  <Input
                    id="address_state"
                    value={formData.address_state}
                    onChange={(e) => setFormData({ ...formData, address_state: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="address_zip">{isBrazil ? 'CEP' : 'ZIP code'}</Label>
                  <Input
                    id="address_zip"
                    value={formData.address_zip}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        address_zip: isBrazil ? formatCep(e.target.value) : e.target.value,
                      });
                      setCepPreview(null);
                    }}
                    onBlur={isBrazil ? lookupCep : undefined}
                    onKeyDown={(e) => {
                      if (isBrazil && e.key === 'Enter') {
                        e.preventDefault();
                        void lookupCep();
                      }
                    }}
                    placeholder={isBrazil ? '00000-000' : undefined}
                    inputMode={isBrazil ? 'numeric' : undefined}
                    maxLength={isBrazil ? 9 : undefined}
                  />
                </div>
              </div>
              {isBrazil && cepLookupLoading && (
                <p className="text-sm text-muted-foreground">Consultando CEP…</p>
              )}
              {isBrazil && cepPreview && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <p className="text-sm font-medium">Endereço encontrado</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[cepPreview.street, cepPreview.neighborhood, cepPreview.city, cepPreview.region]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  <Button type="button" color="secondary" size="sm" className="mt-3" onClick={applyCepPreview}>
                    Aplicar endereço
                  </Button>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button type="submit" color="primary" disabled={loading}>
                {loading ? t('common.loading') : t('common.save')}
              </Button>
              <Link to={isEdit ? `/companies/${id}` : '/companies'}>
                <Button type="button" color="secondary">
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

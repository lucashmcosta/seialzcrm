import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { ArrowLeft } from '@phosphor-icons/react';
import { NameInput } from '@/components/NameInput';
import { OwnerSelector } from '@/components/common/OwnerSelector';

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
    company_id: null as string | null,
    lifecycle_stage: 'lead' as 'lead' | 'customer' | 'inactive',
    do_not_contact: false,
    owner_user_id: userProfile?.id || null as string | null,
    cpf: '',
    rg: '',
    rg_issuer: '',
    nationality: '',
    address_street: '',
    address_neighborhood: '',
    address_city: '',
    address_state: '',
    address_zip: '',
  });
  const [loading, setLoading] = useState(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (isEdit) {
      fetchContact();
    }
    if (organization?.enable_companies_module) {
      fetchCompanies();
    }
  }, [id, organization?.enable_companies_module]);

  const fetchCompanies = async () => {
    if (!organization?.id) return;
    
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .eq('organization_id', organization.id)
      .is('deleted_at', null)
      .order('name');
    
    if (data) {
      setCompanies(data);
    }
  };

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
        company_id: data.company_id || null,
        lifecycle_stage: data.lifecycle_stage || 'lead',
        do_not_contact: data.do_not_contact || false,
        owner_user_id: data.owner_user_id || null,
        cpf: (data as any).cpf || '',
        rg: (data as any).rg || '',
        rg_issuer: (data as any).rg_issuer || '',
        nationality: (data as any).nationality || '',
        address_street: (data as any).address_street || '',
        address_neighborhood: (data as any).address_neighborhood || '',
        address_city: (data as any).address_city || '',
        address_state: (data as any).address_state || '',
        address_zip: (data as any).address_zip || '',
      });
    }
  };

  const checkDuplicates = async () => {
    if (!organization) return [];

    const checkMode = organization.duplicate_check_mode || 'none';
    if (checkMode === 'none') return [];

    let query = supabase
      .from('contacts')
      .select('id, full_name, email, phone')
      .eq('organization_id', organization.id)
      .is('deleted_at', null);

    // Exclude current contact if editing
    if (isEdit && id) {
      query = query.neq('id', id);
    }

    let conditions: any[] = [];

    if (checkMode === 'email' && formData.email) {
      conditions.push({ email: formData.email });
    } else if (checkMode === 'phone' && formData.phone) {
      conditions.push({ phone: formData.phone });
    } else if (checkMode === 'email_or_phone') {
      if (formData.email) conditions.push({ email: formData.email });
      if (formData.phone) conditions.push({ phone: formData.phone });
    }

    if (conditions.length === 0) return [];

    // Check for duplicates
    const duplicateResults = [];
    for (const condition of conditions) {
      if (condition.email) {
        const { data } = await query.eq('email', condition.email);
        if (data) duplicateResults.push(...data);
      }
      if (condition.phone) {
        const { data } = await query.eq('phone', condition.phone);
        if (data) duplicateResults.push(...data);
      }
    }

    // Remove duplicates from results
    const unique = Array.from(new Map(duplicateResults.map(item => [item.id, item])).values());
    return unique;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !userProfile) return;

    setLoading(true);

    // Check for duplicates
    const foundDuplicates = await checkDuplicates();
    
    if (foundDuplicates.length > 0) {
      setDuplicates(foundDuplicates);
      setShowDuplicateWarning(true);
      
      // If enforce_block is true, stop here
      if (organization.duplicate_enforce_block) {
        toast.error(t('contacts.duplicateFound'));
        setLoading(false);
        return;
      }
      
      // If not enforcing, show warning but allow to continue
      setLoading(false);
      return;
    }

    // Proceed with save
    await saveContact();
  };

  const saveContact = async () => {
    if (!organization || !userProfile) return;
    
    setLoading(true);

    const contactData = {
      ...formData,
      organization_id: organization.id,
      owner_user_id: formData.owner_user_id || userProfile.id,
    };

    if (isEdit) {
      const { error } = await supabase
        .from('contacts')
        .update({ ...contactData, updated_by: userProfile.id } as any)
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
        .insert({ ...contactData, created_by: userProfile.id } as any)
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

  const handleForceSave = async () => {
    setShowDuplicateWarning(false);
    setDuplicates([]);
    await saveContact();
  };

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="border-b bg-background/95 backdrop-blur">
          <div className="flex items-center gap-4 px-6 py-4">
            <Link to={isEdit ? `/contacts/${id}` : '/contacts'}>
              <Button color="ghost" size="icon">
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
            {showDuplicateWarning && duplicates.length > 0 && (
              <div className="mb-6 p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
                <h3 className="font-semibold text-destructive mb-2">
                  {t('contacts.duplicateWarning')}
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {t('contacts.duplicateDescription')}
                </p>
                <div className="space-y-2 mb-4">
                  {duplicates.map((dup) => (
                    <div key={dup.id} className="text-sm p-2 bg-background rounded border">
                      <div className="font-medium">{dup.full_name}</div>
                      {dup.email && <div className="text-muted-foreground">{dup.email}</div>}
                      {dup.phone && <div className="text-muted-foreground">{dup.phone}</div>}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  {!organization?.duplicate_enforce_block && (
                    <Button type="button" onClick={handleForceSave} color="destructive">
                      {t('contacts.saveDespiteDuplicate')}
                    </Button>
                  )}
                  <Button type="button" onClick={() => setShowDuplicateWarning(false)} color="secondary">
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            )}
            
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
                <PhoneInput
                  id="phone"
                  value={formData.phone}
                  onChange={(e164) => setFormData({ ...formData, phone: e164 })}
                />
              </div>

              {organization?.enable_companies_module ? (
                <div>
                  <Label htmlFor="company">{t('contacts.company')}</Label>
                  <Select
                    value={formData.company_id || 'none'}
                    onValueChange={(value) => setFormData({ ...formData, company_id: value === 'none' ? null : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('common.select')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('common.none')}</SelectItem>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label htmlFor="company">{t('contacts.company')}</Label>
                  <Input
                    id="company"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  />
                </div>
              )}

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

              <div>
                <Label>{t('contacts.owner') || 'Responsável'}</Label>
                <OwnerSelector
                  value={formData.owner_user_id}
                  onChange={(userId) => setFormData({ ...formData, owner_user_id: userId })}
                />
              </div>

              {/* Documentos */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground border-b pb-2">Documentos</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cpf">CPF</Label>
                    <Input
                      id="cpf"
                      value={formData.cpf}
                      onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div>
                    <Label htmlFor="rg">RG</Label>
                    <Input
                      id="rg"
                      value={formData.rg}
                      onChange={(e) => setFormData({ ...formData, rg: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="rg_issuer">Órgão Emissor</Label>
                    <Input
                      id="rg_issuer"
                      value={formData.rg_issuer}
                      onChange={(e) => setFormData({ ...formData, rg_issuer: e.target.value })}
                      placeholder="SSP/SP"
                    />
                  </div>
                  <div>
                    <Label htmlFor="nationality">Nacionalidade</Label>
                    <Input
                      id="nationality"
                      value={formData.nationality}
                      onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                      placeholder="brasileiro(a)"
                    />
                  </div>
                </div>
              </div>

              {/* Endereço */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground border-b pb-2">Endereço</h3>
                <div>
                  <Label htmlFor="address_street">Rua / Número</Label>
                  <Input
                    id="address_street"
                    value={formData.address_street}
                    onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="address_neighborhood">Bairro</Label>
                    <Input
                      id="address_neighborhood"
                      value={formData.address_neighborhood}
                      onChange={(e) => setFormData({ ...formData, address_neighborhood: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="address_city">Cidade</Label>
                    <Input
                      id="address_city"
                      value={formData.address_city}
                      onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="address_state">Estado</Label>
                    <Input
                      id="address_state"
                      value={formData.address_state}
                      onChange={(e) => setFormData({ ...formData, address_state: e.target.value })}
                      placeholder="SP"
                    />
                  </div>
                  <div>
                    <Label htmlFor="address_zip">CEP</Label>
                    <Input
                      id="address_zip"
                      value={formData.address_zip}
                      onChange={(e) => setFormData({ ...formData, address_zip: e.target.value })}
                      placeholder="00000-000"
                    />
                  </div>
                </div>
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
                <Button type="submit" color="primary" disabled={loading}>
                  {loading ? t('common.loading') : t('common.save')}
                </Button>
                <Button
                  type="button"
                  color="secondary"
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

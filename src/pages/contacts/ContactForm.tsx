import { useEffect, useRef, useState } from 'react';
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
import { useRegistryLookup } from '@/hooks/useRegistryLookup';
import {
  canonicalContactName,
  contactSexLabelFor,
  cpfStatusLabelFor,
  digits,
  formatCep,
  formatCpf,
  isValidCpf,
  normalizeContactSex,
  type CpfVerificationStatus,
  type OperatingCountryCode,
} from '@/lib/regional';

/**
 * Porta em TS a função public.normalize_phone_br do banco.
 * Necessário pra checagem de duplicidade encontrar contatos
 * salvos com/sem o 9º dígito (formato antigo).
 */
function normalizePhoneBR(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length < 10) return digits || null;

  let local: string;
  if (digits.startsWith('55') && digits.length >= 12) {
    local = digits.substring(2);
  } else {
    return digits;
  }

  if (local.length !== 10 && local.length !== 11) return digits;

  const ddd = local.substring(0, 2);
  const rest = local.substring(2);

  if (local.length === 11 && rest.charAt(0) === '9') {
    return '55' + local;
  }
  if (local.length === 10) {
    return '55' + ddd + '9' + rest;
  }
  return '55' + local;
}


export default function ContactForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { organization, userProfile, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { lookup, isBrazil } = useRegistryLookup();
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
    address_number: '',
    address_complement: '',
    address_neighborhood: '',
    address_city: '',
    address_state: '',
    address_zip: '',
    address_country_code: '',
  });
  const [loading, setLoading] = useState(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [cpfLookupLoading, setCpfLookupLoading] = useState(false);
  const [cpfVerification, setCpfVerification] = useState<{
    status: CpfVerificationStatus;
    registrationStatus: string;
    birthDate: string;
    sex: string;
    motherName: string;
    provider: string;
    providerVersion: string;
    errorCode: string;
    providerCode: string;
    providerMessage: string;
  }>({
    status: 'unverified',
    registrationStatus: '',
    birthDate: '',
    sex: '',
    motherName: '',
    provider: '',
    providerVersion: '',
    errorCode: '',
    providerCode: '',
    providerMessage: '',
  });
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [cepPreview, setCepPreview] = useState<null | {
    postal_code?: string;
    street?: string;
    neighborhood?: string;
    city?: string;
    region?: string;
    country_code?: string;
  }>(null);
  const lastCpfLookupRef = useRef('');
  const cpfLookupSequenceRef = useRef(0);
  const cpfInFlightRef = useRef('');
  const lastCepLookupRef = useRef('');

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
        cpf: formatCpf(data.cpf),
        rg: data.rg || '',
        rg_issuer: data.rg_issuer || '',
        nationality: data.nationality || '',
        address_street: data.address_street || '',
        address_number: data.address_number || '',
        address_complement: data.address_complement || '',
        address_neighborhood: data.address_neighborhood || '',
        address_city: data.address_city || '',
        address_state: data.address_state || '',
        address_zip: organization.operating_country_code === 'BR'
          ? formatCep(data.address_zip)
          : data.address_zip || '',
        address_country_code: data.address_country_code || organization.operating_country_code || '',
      });

      const { data: identity } = await supabase
        .from('contact_identity_profiles')
        .select('cpf_verification_status,cpf_registration_status,birth_date,sex,mother_name,verification_provider,verification_provider_version,last_error_code,last_provider_code,last_provider_message')
        .eq('contact_id', data.id)
        .maybeSingle();
      if (identity) {
        setCpfVerification({
          status: identity.cpf_verification_status || 'unverified',
          registrationStatus: identity.cpf_registration_status || '',
          birthDate: identity.birth_date || '',
          sex: normalizeContactSex(identity.sex),
          motherName: identity.mother_name || '',
          provider: identity.verification_provider || '',
          providerVersion: identity.verification_provider_version || '',
          errorCode: identity.last_error_code || '',
          providerCode: identity.last_provider_code || '',
          providerMessage: identity.last_provider_message || '',
        });
        lastCpfLookupRef.current = digits(data.cpf);
      }
    }
  };

  const handleCpfChange = (value: string) => {
    const normalized = digits(value).slice(0, 11);
    const sequence = ++cpfLookupSequenceRef.current;
    setCpfLookupLoading(false);
    setFormData((current) => ({ ...current, cpf: formatCpf(normalized) }));
    if (normalized !== lastCpfLookupRef.current) {
      setCpfVerification((current) => ({
        ...current,
        status: 'unverified',
        registrationStatus: '',
        birthDate: '',
        sex: '',
        motherName: '',
        provider: '',
        providerVersion: '',
        errorCode: '',
      }));
    }
    if (normalized.length === 11) {
      void verifyCpf(normalized, sequence);
    }
  };

  const verifyCpf = async (candidate = formData.cpf, expectedSequence?: number) => {
    if (!isBrazil) return;
    const cpf = digits(candidate);
    if (!cpf) return;
    if (cpfInFlightRef.current === cpf) return;
    if (!isValidCpf(cpf)) {
      setCpfVerification((current) => ({ ...current, status: 'invalid', errorCode: 'invalid_cpf' }));
      toast.error('CPF inválido. Confira os dígitos informados.');
      return;
    }
    if (cpf === lastCpfLookupRef.current && cpfVerification.status === 'verified') return;

    const sequence = expectedSequence ?? ++cpfLookupSequenceRef.current;
    if (sequence !== cpfLookupSequenceRef.current) return;
    cpfInFlightRef.current = cpf;
    setCpfLookupLoading(true);
    setCpfVerification((current) => ({ ...current, status: 'pending', errorCode: '' }));
    try {
      const result = await lookup<{
        cpf?: string;
        full_name?: string;
        registration_status?: string;
        birth_date?: string;
        sex?: string;
        mother_name?: string;
      }>('cpf', cpf);
      if (sequence !== cpfLookupSequenceRef.current) return;
      const data = result.data || {};
      lastCpfLookupRef.current = cpf;
      setFormData((current) => ({
        ...current,
        cpf: formatCpf(cpf),
        full_name: data.full_name || current.full_name,
      }));
      setCpfVerification((current) => ({
        status: 'verified',
        registrationStatus: data.registration_status || current.registrationStatus,
        birthDate: data.birth_date || current.birthDate,
        sex: normalizeContactSex(data.sex) || current.sex,
        motherName: data.mother_name || current.motherName,
        provider: result.provider || 'cpf-brasil',
        providerVersion: result.provider_version || '2.0',
        errorCode: '',
      }));
      toast.success('CPF verificado e dados cadastrais preenchidos.');
    } catch (error: unknown) {
      if (sequence !== cpfLookupSequenceRef.current) return;
      const code = error instanceof Error ? error.message : 'registry_lookup_failed';
      const invalid = code.includes('invalid_or_not_found') || code.includes('invalid_cpf');
      setCpfVerification((current) => ({
        ...current,
        status: invalid ? 'invalid' : 'error',
        errorCode: code,
      }));
      toast.error(
        invalid
          ? 'CPF não encontrado ou inválido.'
          : 'Não foi possível verificar agora. O contato poderá ser salvo como não verificado.',
      );
    } finally {
      if (cpfInFlightRef.current === cpf) cpfInFlightRef.current = '';
      if (sequence === cpfLookupSequenceRef.current) setCpfLookupLoading(false);
    }
  };

  const lookupCep = async () => {
    if (!isBrazil || cepLookupLoading) return;
    const cep = digits(formData.address_zip);
    if (!cep) return;
    if (cep.length !== 8) {
      toast.error('Informe um CEP com 8 dígitos.');
      return;
    }
    if (cep === lastCepLookupRef.current && cepPreview) return;
    setCepLookupLoading(true);
    try {
      const result = await lookup<{
        postal_code?: string;
        street?: string;
        neighborhood?: string;
        city?: string;
        region?: string;
        country_code?: string;
      }>('cep', cep);
      setCepPreview(result.data || null);
      lastCepLookupRef.current = cep;
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
      conditions.push({ phone_normalized: normalizePhoneBR(formData.phone) });
    } else if (checkMode === 'email_or_phone') {
      if (formData.email) conditions.push({ email: formData.email });
      if (formData.phone) conditions.push({ phone_normalized: normalizePhoneBR(formData.phone) });
    }

    if (conditions.length === 0) return [];

    // Check for duplicates
    const duplicateResults = [];
    for (const condition of conditions) {
      if (condition.email) {
        const { data } = await query.eq('email', condition.email);
        if (data) duplicateResults.push(...data);
      }
      if (condition.phone_normalized) {
        const { data } = await query.eq('phone_normalized', condition.phone_normalized);
        if (data) duplicateResults.push(...data);
      }
    }

    // Remove duplicates from results
    const unique = Array.from(new Map(duplicateResults.map(item => [item.id, item])).values());
    return unique;
  };

  const checkPhoneUniqueness = async () => {
    if (!organization || !formData.phone) return [];
    const normalized = normalizePhoneBR(formData.phone);
    if (!normalized) return [];
    let query = supabase
      .from('contacts')
      .select('id, full_name, email, phone')
      .eq('organization_id', organization.id)
      .eq('phone_normalized', normalized)
      .is('deleted_at', null);
    if (isEdit && id) query = query.neq('id', id);
    const { data } = await query;
    return data || [];
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !userProfile) return;

    setLoading(true);

    // Check for duplicates (org rule)
    const foundDuplicates = await checkDuplicates();

    // Always check phone uniqueness — DB has a unique index on (org, phone_normalized)
    const phoneDuplicates = await checkPhoneUniqueness();
    const allDuplicates = Array.from(
      new Map([...foundDuplicates, ...phoneDuplicates].map((d) => [d.id, d])).values()
    );

    if (allDuplicates.length > 0) {
      setDuplicates(allDuplicates);
      setShowDuplicateWarning(true);

      // Phone duplicates are always blocking (DB unique index)
      const hasPhoneDup = phoneDuplicates.length > 0;

      if (organization.duplicate_enforce_block || hasPhoneDup) {
        toast.error(
          hasPhoneDup
            ? 'Já existe um contato com este telefone nesta organização'
            : t('contacts.duplicateFound')
        );
        setLoading(false);
        return;
      }

      setLoading(false);
      return;
    }

    // Proceed with save
    await saveContact();
  };

  const saveContact = async () => {
    if (!organization || !userProfile) return;
    if (!organization.operating_country_code) {
      toast.error('Escolha o país operacional da organização antes de salvar.');
      return;
    }
    if (isBrazil && formData.cpf) {
      const cpfDigits = digits(formData.cpf);
      if (cpfDigits.length !== 11) {
        setCpfVerification((current) => ({ ...current, status: 'invalid' }));
        toast.error('O CPF deve ter exatamente 11 dígitos.');
        return;
      }
      if (!isValidCpf(cpfDigits)) {
        setCpfVerification((current) => ({ ...current, status: 'invalid' }));
        toast.error('CPF inválido. Confira os dígitos informados.');
        return;
      }
    }
    
    setLoading(true);

    const name = canonicalContactName(
      organization.operating_country_code as OperatingCountryCode,
      {
        fullName: formData.full_name,
        firstName: formData.first_name,
        lastName: formData.last_name,
      },
    );
    const contactData = {
      ...formData,
      full_name: name.fullName,
      first_name: name.firstName,
      last_name: name.lastName,
      cpf: formData.cpf ? digits(formData.cpf) : null,
      address_zip: isBrazil ? digits(formData.address_zip) : formData.address_zip || null,
      address_country_code: formData.address_country_code || organization.operating_country_code,
      organization_id: organization.id,
      owner_user_id: formData.owner_user_id || userProfile.id,
    };

    const saveIdentity = async (contactId: string) => {
      if (!isBrazil) return;
      const { error } = await supabase
        .from('contact_identity_profiles')
        .upsert({
          organization_id: organization.id,
          contact_id: contactId,
          cpf_verification_status: cpfVerification.status,
          cpf_registration_status: cpfVerification.registrationStatus || null,
          birth_date: cpfVerification.birthDate || null,
          sex: cpfVerification.sex || null,
          mother_name: cpfVerification.motherName || null,
          verification_provider: cpfVerification.provider || null,
          verification_provider_version: cpfVerification.providerVersion || null,
          cpf_verified_at: cpfVerification.status === 'verified' ? new Date().toISOString() : null,
          last_error_code: cpfVerification.errorCode || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'contact_id' });
      if (error) throw error;
    };

    const handleDbError = async (error: unknown) => {
      const dbError = error as { code?: string; message?: string };
      // Postgres unique violation
      if (dbError.code === '23505') {
        const msg = String(dbError.message || '');
        const duplicateCpfId = msg.match(/duplicate_cpf:([0-9a-f-]{36})/i)?.[1];
        if (duplicateCpfId) {
          toast.error('Este CPF já pertence a outro contato. Abrindo o cadastro existente.');
          navigate(`/contacts/${duplicateCpfId}`);
          return;
        }
        if (msg.includes('phone_normalized') || msg.includes('phone')) {
          const dups = await checkPhoneUniqueness();
          if (dups.length > 0) {
            setDuplicates(dups);
            setShowDuplicateWarning(true);
          }
          toast.error('Já existe um contato com este telefone nesta organização');
          return;
        }
        if (msg.includes('email')) {
          toast.error('Já existe um contato com este e-mail nesta organização');
          return;
        }
      }
      toast.error(dbError.message || t('common.error'));
    };

    if (isEdit) {
      const { error } = await supabase
        .from('contacts')
        .update({ ...contactData, updated_by: userProfile.id })
        .eq('id', id);

      if (error) {
        await handleDbError(error);
        setLoading(false);
        return;
      }

      try {
        await saveIdentity(id!);
      } catch (identityError: unknown) {
        toast.error(identityError instanceof Error
          ? identityError.message
          : 'Contato salvo, mas a verificação cadastral não foi registrada.');
        setLoading(false);
        return;
      }
      toast.success(t('contacts.updated'));
      navigate(`/contacts/${id}`);
    } else {
      const { data, error } = await supabase
        .from('contacts')
        .insert({ ...contactData, created_by: userProfile.id })
        .select()
        .single();

      if (error) {
        await handleDbError(error);
        setLoading(false);
        return;
      }

      try {
        await saveIdentity(data.id);
      } catch (identityError: unknown) {
        toast.error(identityError instanceof Error
          ? identityError.message
          : 'Contato salvo, mas a verificação cadastral não foi registrada.');
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

  if (organization && !organization.operating_country_code) {
    return (
      <Layout>
        <div className="p-6">
          <Card className="mx-auto max-w-xl p-6">
            <h1 className="text-xl font-semibold">Escolha o país operacional</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              O padrão regional precisa ser definido antes de criar ou editar contatos.
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
            {showDuplicateWarning && duplicates.length > 0 && (() => {
              const hasPhoneDup = duplicates.some((d) => d.phone && d.phone === formData.phone);
              return (
                <div className="mb-6 p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
                  <h3 className="font-semibold text-destructive mb-2">
                    {t('contacts.duplicateWarning')}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {hasPhoneDup
                      ? 'Já existe um contato com este telefone. Deseja abrir o contato existente?'
                      : t('contacts.duplicateDescription')}
                  </p>
                  <div className="space-y-2 mb-4">
                    {duplicates.map((dup) => (
                      <div key={dup.id} className="text-sm p-2 bg-background rounded border flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{dup.full_name}</div>
                          {dup.email && <div className="text-muted-foreground truncate">{dup.email}</div>}
                          {dup.phone && <div className="text-muted-foreground">{dup.phone}</div>}
                        </div>
                        <Button
                          type="button"
                          color="primary"
                          size="sm"
                          onClick={() => navigate(`/contacts/${dup.id}`)}
                        >
                          Abrir contato
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {!hasPhoneDup && !organization?.duplicate_enforce_block && (
                      <Button type="button" onClick={handleForceSave} color="destructive">
                        {t('contacts.saveDespiteDuplicate')}
                      </Button>
                    )}
                    <Button type="button" onClick={() => setShowDuplicateWarning(false)} color="secondary">
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              );
            })()}
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <NameInput
                locale={locale as any}
                countryCode={organization?.operating_country_code}
                fullName={formData.full_name}
                firstName={formData.first_name}
                lastName={formData.last_name}
                onFullNameChange={(value) => setFormData({ ...formData, full_name: value })}
                onFirstNameChange={(value) => setFormData({ ...formData, first_name: value })}
                onLastNameChange={(value) => setFormData({ ...formData, last_name: value })}
                required
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

              {/* Documentos brasileiros */}
              {isBrazil && <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground border-b pb-2">Documentos</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="cpf">CPF</Label>
                      <span className={`text-xs ${
                        cpfVerification.status === 'verified'
                          ? 'text-emerald-600'
                          : cpfVerification.status === 'invalid'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      }`}>
                        {cpfLookupLoading ? 'Consultando…' : cpfStatusLabelFor(cpfVerification.status, locale)}
                      </span>
                    </div>
                    <Input
                      id="cpf"
                      value={formData.cpf}
                      onChange={(e) => handleCpfChange(e.target.value)}
                      onBlur={() => void verifyCpf()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void verifyCpf();
                        }
                      }}
                      placeholder="000.000.000-00"
                      inputMode="numeric"
                      minLength={14}
                      maxLength={14}
                      aria-describedby="cpf-format-help"
                    />
                    <p id="cpf-format-help" className="mt-1 text-xs text-muted-foreground">
                      Se informado, o CPF deve ter exatamente 11 dígitos.
                    </p>
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
                  <div>
                    <Label htmlFor="birth_date">Data de nascimento</Label>
                    <Input
                      id="birth_date"
                      type="date"
                      value={cpfVerification.birthDate}
                      onChange={(event) => setCpfVerification((current) => ({
                        ...current,
                        birthDate: event.target.value,
                      }))}
                      max={new Date().toISOString().slice(0, 10)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="sex">Sexo</Label>
                    <Select
                      value={cpfVerification.sex || 'not_informed'}
                      onValueChange={(value) => setCpfVerification((current) => ({
                        ...current,
                        sex: value === 'not_informed' ? '' : value,
                      }))}
                    >
                      <SelectTrigger id="sex">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_informed">Não informado</SelectItem>
                        <SelectItem value="female">Feminino</SelectItem>
                        <SelectItem value="male">Masculino</SelectItem>
                        <SelectItem value="other">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="mother_name">Nome da mãe</Label>
                    <Input
                      id="mother_name"
                      value={cpfVerification.motherName}
                      onChange={(event) => setCpfVerification((current) => ({
                        ...current,
                        motherName: event.target.value,
                      }))}
                      placeholder="Nome completo"
                    />
                  </div>
                </div>
                {cpfVerification.status === 'verified' && (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="text-sm font-medium">Verificação cadastral</p>
                    <dl className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">Situação cadastral</dt>
                        <dd>{cpfVerification.registrationStatus || 'Não informada'}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Sexo normalizado</dt>
                        <dd>{contactSexLabelFor(cpfVerification.sex, locale)}</dd>
                      </div>
                    </dl>
                  </div>
                )}
              </div>}

              {/* Endereço */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground border-b pb-2">Endereço</h3>
                <div className={`grid grid-cols-1 gap-4 ${isBrazil ? 'md:grid-cols-[1fr_140px]' : ''}`}>
                  <div>
                    <Label htmlFor="address_street">{isBrazil ? 'Logradouro' : 'Street address'}</Label>
                    <Input
                      id="address_street"
                      value={formData.address_street}
                      onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                    />
                  </div>
                  {isBrazil && <div>
                    <Label htmlFor="address_number">Número</Label>
                    <Input
                      id="address_number"
                      value={formData.address_number}
                      onChange={(e) => setFormData({ ...formData, address_number: e.target.value })}
                    />
                  </div>}
                </div>
                <div>
                  <Label htmlFor="address_complement">{isBrazil ? 'Complemento' : 'Address line 2'}</Label>
                  <Input
                    id="address_complement"
                    value={formData.address_complement}
                    onChange={(e) => setFormData({ ...formData, address_complement: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {isBrazil && <div>
                    <Label htmlFor="address_neighborhood">Bairro</Label>
                    <Input
                      id="address_neighborhood"
                      value={formData.address_neighborhood}
                      onChange={(e) => setFormData({ ...formData, address_neighborhood: e.target.value })}
                    />
                  </div>}
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
                      placeholder="SP"
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
                      placeholder={isBrazil ? '00000-000' : '00000'}
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

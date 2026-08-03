import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  SpinnerGap,
  Phone,
  FloppyDisk,
  Users,
  UserPlus,
  PhoneCall,
  PhoneOutgoing,
  MagnifyingGlass,
  ShieldCheck,
  Clock,
  WarningCircle,
} from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { telephonySupabase } from '@/integrations/supabase/telephonyClient';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from 'sonner';
import { formatPhoneDisplay } from '@/lib/phoneUtils';
import { TwilioNumberManagement } from './TwilioNumberManagement';

interface InboundSettings {
  auto_create_contact: boolean;
  default_lifecycle_stage: string;
}
interface NumberUserGrant {
  user_id: string;
  can_receive_calls: boolean;
  can_originate_calls: boolean;
  priority: number;
}

interface PhoneNumber {
  id: string;
  phone_number: string;
  friendly_name: string | null;
  ring_strategy: string;
  ring_users: string[];
  ring_timeout_seconds: number;
  inbound_settings: InboundSettings;
  number_type: 'company' | 'user';
  assigned_user_id: string | null;
  is_active: boolean;
  is_default_outbound: boolean;
  recording_enabled: boolean;
  timezone: string | null;
  business_hours: { enabled: boolean; schedule: Record<string, Array<{ start: string; end: string }>> };
  max_attempts: number;
  hold_message: string;
  fallback_message: string;
  missed_call_owner_user_id: string | null;
  grants: NumberUserGrant[];
}

interface User {
  id: string;
  full_name: string;
  email: string;
}

const WEEKDAYS = [
  ['monday', 'Segunda'], ['tuesday', 'Terça'], ['wednesday', 'Quarta'],
  ['thursday', 'Quinta'], ['friday', 'Sexta'], ['saturday', 'Sábado'], ['sunday', 'Domingo'],
] as const;

const defaultBusinessHours = () => ({
  enabled: false,
  schedule: Object.fromEntries(WEEKDAYS.map(([key], index) => [key, index < 5 ? [{ start: '09:00', end: '18:00' }] : []])),
});

export function PhoneNumberSettings() {
  const { organization } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<PhoneNumber | null>(null);
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    if (organization?.id) {
      fetchData();
    }
  }, [organization?.id]);

  const fetchData = async () => {
    if (!organization?.id) return;

    setLoading(true);
    try {
      // Fetch phone numbers
      const { data: phones, error: phonesError } = await telephonySupabase
        .from('organization_phone_numbers')
        .select('*')
        .eq('organization_id', organization.id)
        .order('is_primary', { ascending: false });

      if (phonesError) throw phonesError;

      const phoneIds = (phones || []).map((phone) => phone.id);
      const { data: grants, error: grantsError } = phoneIds.length > 0
        ? await telephonySupabase.from('organization_phone_number_users')
          .select('phone_number_id, user_id, can_receive_calls, can_originate_calls, priority')
          .in('phone_number_id', phoneIds)
        : { data: [], error: null };
      if (grantsError) throw grantsError;

      // Fetch organization users
      const { data: userOrgs, error: usersError } = await supabase
        .from('user_organizations')
        .select(`
          user_id,
          users!inner(id, full_name, email)
        `)
        .eq('organization_id', organization.id)
        .eq('is_active', true);

      if (usersError) throw usersError;

      const phoneList: PhoneNumber[] = (phones || []).map((phone) => ({
        id: phone.id,
        phone_number: phone.phone_number,
        friendly_name: phone.friendly_name,
        ring_strategy: phone.ring_strategy,
        ring_users: phone.ring_users || [],
        ring_timeout_seconds: phone.ring_timeout_seconds || 30,
        inbound_settings: (phone.inbound_settings as unknown as InboundSettings) || { auto_create_contact: true, default_lifecycle_stage: 'lead' },
        number_type: (phone.number_type as 'company' | 'user') || (phone.assigned_user_id ? 'user' : 'company'),
        assigned_user_id: phone.assigned_user_id,
        is_active: phone.is_active ?? true,
        is_default_outbound: phone.is_default_outbound ?? phone.is_primary ?? false,
        recording_enabled: phone.recording_enabled ?? false,
        timezone: phone.timezone,
        business_hours: (phone.business_hours as unknown as PhoneNumber['business_hours']) || defaultBusinessHours(),
        max_attempts: phone.number_type === 'user' ? 1 : (phone.max_attempts || 3),
        hold_message: phone.hold_message || 'Aguarde um momento enquanto consultamos outro atendente.',
        fallback_message: phone.fallback_message || 'No momento não podemos atender. Registramos sua ligação e retornaremos em breve.',
        missed_call_owner_user_id: phone.missed_call_owner_user_id,
        grants: (grants || []).filter((grant) => grant.phone_number_id === phone.id),
      }));
      
      setPhoneNumbers(phoneList);
      setSelectedPhone((current) => (
        phoneList.find((phone) => phone.id === current?.id) || phoneList[0] || null
      ));

      const userList = userOrgs?.map(uo => ({
        id: (uo.users as any).id,
        full_name: (uo.users as any).full_name,
        email: (uo.users as any).email,
      })) || [];
      setUsers(userList);

    } catch (error) {
      console.error('Error fetching phone settings:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPhone) return;
    if (!selectedPhone.missed_call_owner_user_id) {
      toast.error('Defina o responsável pelas chamadas perdidas');
      return;
    }
    if (selectedPhone.number_type === 'user' && !selectedPhone.assigned_user_id) {
      toast.error('Defina o titular do número individual');
      return;
    }
    if (selectedPhone.number_type === 'user' && selectedPhone.is_active && phoneNumbers.some((number) =>
      number.id !== selectedPhone.id && number.is_active && number.number_type === 'user' &&
      number.assigned_user_id === selectedPhone.assigned_user_id
    )) {
      toast.error('Este usuário já possui outro número individual ativo');
      return;
    }

    setSaving(true);
    try {
      const isCompanyDefault = selectedPhone.number_type === 'company' && selectedPhone.is_default_outbound;
      if (isCompanyDefault) {
        const { error: defaultError } = await telephonySupabase
          .from('organization_phone_numbers')
          .update({ is_default_outbound: false })
          .eq('organization_id', organization!.id)
          .eq('provider', 'twilio')
          .neq('id', selectedPhone.id);
        if (defaultError) throw defaultError;
      }

      const { error } = await telephonySupabase
        .from('organization_phone_numbers')
        .update({
          friendly_name: selectedPhone.friendly_name,
          inbound_settings: JSON.parse(JSON.stringify(selectedPhone.inbound_settings)),
          number_type: selectedPhone.number_type,
          assigned_user_id: selectedPhone.number_type === 'user' ? selectedPhone.assigned_user_id : null,
          is_active: selectedPhone.is_active,
          is_default_outbound: isCompanyDefault,
          recording_enabled: selectedPhone.recording_enabled,
          timezone: selectedPhone.timezone || organization?.timezone || 'America/Sao_Paulo',
          business_hours: selectedPhone.business_hours,
          max_attempts: selectedPhone.number_type === 'user' ? 1 : Math.min(selectedPhone.max_attempts, 3),
          fallback_action: 'message_and_task',
          hold_message: selectedPhone.hold_message,
          fallback_message: selectedPhone.fallback_message,
          missed_call_owner_user_id: selectedPhone.missed_call_owner_user_id,
          ring_strategy: selectedPhone.number_type === 'user' ? 'specific_users' : 'round_robin',
          ring_timeout_seconds: 15,
        })
        .eq('id', selectedPhone.id);

      if (error) throw error;

      const normalizedGrants = users.map((user, index) => {
        const existing = selectedPhone.grants.find((grant) => grant.user_id === user.id);
        const isOwner = selectedPhone.number_type === 'user' && selectedPhone.assigned_user_id === user.id;
        return {
          organization_id: organization!.id,
          phone_number_id: selectedPhone.id,
          user_id: user.id,
          can_receive_calls: isOwner || (selectedPhone.number_type === 'company' && existing?.can_receive_calls === true),
          can_originate_calls: isOwner || existing?.can_originate_calls === true,
          priority: existing?.priority ?? index + 1,
        };
      });
      const { error: grantError } = await telephonySupabase.from('organization_phone_number_users')
        .upsert(normalizedGrants, { onConflict: 'phone_number_id,user_id' });
      if (grantError) throw grantError;

      toast.success('Configurações salvas com sucesso');
      fetchData();
    } catch (error) {
      console.error('Error saving phone settings:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const updateGrant = (userId: string, key: 'can_receive_calls' | 'can_originate_calls', value: boolean) => {
    if (!selectedPhone) return;
    const current = selectedPhone.grants.find((grant) => grant.user_id === userId) || {
      user_id: userId, can_receive_calls: false, can_originate_calls: false, priority: selectedPhone.grants.length + 1,
    };
    setSelectedPhone({
      ...selectedPhone,
      grants: [...selectedPhone.grants.filter((grant) => grant.user_id !== userId), { ...current, [key]: value }],
    });
  };

  const updateAllGrants = (key: 'can_receive_calls' | 'can_originate_calls', value: boolean) => {
    if (!selectedPhone) return;
    const nextGrants = users.map((user, index) => {
      const current = selectedPhone.grants.find((grant) => grant.user_id === user.id) || {
        user_id: user.id,
        can_receive_calls: false,
        can_originate_calls: false,
        priority: index + 1,
      };
      const isOwner = selectedPhone.number_type === 'user' && selectedPhone.assigned_user_id === user.id;
      return { ...current, [key]: isOwner ? true : value };
    });
    setSelectedPhone({ ...selectedPhone, grants: nextGrants });
  };

  const updateScheduleDay = (day: string, enabled: boolean, start = '09:00', end = '18:00') => {
    if (!selectedPhone) return;
    setSelectedPhone({
      ...selectedPhone,
      business_hours: {
        ...selectedPhone.business_hours,
        schedule: {
          ...selectedPhone.business_hours.schedule,
          [day]: enabled ? [{ start, end }] : [],
        },
      },
    });
  };

  const updateInboundSetting = (key: keyof InboundSettings, value: any) => {
    if (!selectedPhone) return;
    
    setSelectedPhone({
      ...selectedPhone,
      inbound_settings: {
        ...selectedPhone.inbound_settings,
        [key]: value
      }
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <SpinnerGap className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (phoneNumbers.length === 0) {
    return (
      <div className="space-y-4">
        <TwilioNumberManagement users={users} onChanged={fetchData} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Configuração de Chamadas
            </CardTitle>
            <CardDescription>
              Nenhum número sincronizado. Importe um número da conta Twilio ou compre uma nova linha acima.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const normalizedSearch = userSearch.trim().toLocaleLowerCase('pt-BR');
  const filteredUsers = users.filter((user) => !normalizedSearch
    || user.full_name.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
    || user.email.toLocaleLowerCase('pt-BR').includes(normalizedSearch));
  const receiveCount = selectedPhone?.number_type === 'user'
    ? (selectedPhone.assigned_user_id ? 1 : 0)
    : users.filter((user) => selectedPhone?.grants.some((grant) => grant.user_id === user.id && grant.can_receive_calls)).length;
  const originateCount = users.filter((user) => {
    if (selectedPhone?.number_type === 'user' && selectedPhone.assigned_user_id === user.id) return true;
    return selectedPhone?.grants.some((grant) => grant.user_id === user.id && grant.can_originate_calls);
  }).length;

  return (
    <div className="space-y-4">
    <TwilioNumberManagement users={users} onChanged={fetchData} />
    <Card className="overflow-hidden border-primary/20 shadow-sm">
      <CardHeader className="border-b bg-muted/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <span className="rounded-lg bg-primary/10 p-2 text-primary"><Phone className="h-5 w-5" /></span>
              Central de telefonia
            </CardTitle>
            <CardDescription className="mt-2">
              Defina quem atende, quem pode ligar e o que acontece quando ninguém está disponível.
            </CardDescription>
          </div>
          {selectedPhone && (
            <div className="flex flex-wrap gap-2">
              <Badge variant={selectedPhone.is_active ? 'default' : 'secondary'}>{selectedPhone.is_active ? 'Ativo' : 'Inativo'}</Badge>
              <Badge variant="outline">{selectedPhone.number_type === 'company' ? 'Corporativo' : 'Individual'}</Badge>
              {selectedPhone.is_default_outbound && <Badge variant="outline">Saída padrão</Badge>}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-8 p-4 sm:p-6">
        <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <Label>Número que está sendo configurado</Label>
            <Select
              value={selectedPhone?.id}
              onValueChange={(id) => {
                const phone = phoneNumbers.find(p => p.id === id);
                if (phone) {
                  setSelectedPhone(phone);
                  setUserSearch('');
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {phoneNumbers.map(phone => (
                  <SelectItem key={phone.id} value={phone.id}>
                    {phone.friendly_name || 'Sem nome'} · {formatPhoneDisplay(phone.phone_number)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedPhone && (
            <div className="flex gap-2 text-sm text-muted-foreground md:justify-end">
              <span><strong className="text-foreground">{receiveCount}</strong> recebem</span>
              <span>·</span>
              <span><strong className="text-foreground">{originateCount}</strong> podem ligar</span>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
          <div>
            <p className="text-sm font-semibold">Linhas individuais da equipe</p>
            <p className="text-xs text-muted-foreground">Cada usuário pode ter no máximo uma linha individual ativa.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {users.map((user) => {
              const personal = phoneNumbers.find((phone) => phone.is_active && phone.number_type === 'user' && phone.assigned_user_id === user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => personal && setSelectedPhone(personal)}
                  disabled={!personal}
                  className="rounded-lg border bg-card p-3 text-left disabled:cursor-default disabled:opacity-70"
                >
                  <span className="block truncate text-sm font-medium">{user.full_name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {personal ? formatPhoneDisplay(personal.phone_number) : 'Sem número individual'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {selectedPhone && (
          <>
            <section className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">1. Identificação e responsabilidade</p>
                <h3 className="mt-1 text-base font-semibold">Como este número será usado</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="friendlyName">Nome do número</Label>
                  <Input
                    id="friendlyName"
                    value={selectedPhone.friendly_name || ''}
                    onChange={(e) => setSelectedPhone({ ...selectedPhone, friendly_name: e.target.value })}
                    placeholder="Ex: Vendas, Suporte, Principal"
                  />
                  <p className="text-xs text-muted-foreground">{formatPhoneDisplay(selectedPhone.phone_number)}</p>
                </div>
              <div className="space-y-2">
                <Label>Tipo do número</Label>
                <Select value={selectedPhone.number_type} onValueChange={(value: 'company' | 'user') => setSelectedPhone({
                  ...selectedPhone,
                  number_type: value,
                  max_attempts: value === 'user' ? 1 : 3,
                  assigned_user_id: value === 'user' ? selectedPhone.assigned_user_id : null,
                })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Corporativo · round-robin</SelectItem>
                    <SelectItem value="user">Individual · somente titular</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {selectedPhone.number_type === 'company'
                    ? 'Distribui para a equipe autorizada em round-robin.'
                    : 'Toca exclusivamente para o titular definido.'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Responsável por chamadas perdidas</Label>
                <Select value={selectedPhone.missed_call_owner_user_id || ''} onValueChange={(value) => setSelectedPhone({
                  ...selectedPhone, missed_call_owner_user_id: value,
                })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Recebe a tarefa automática de retorno após o fallback.</p>
              </div>
              </div>

            {selectedPhone.number_type === 'user' && (
              <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <Label>Titular</Label>
                <Select value={selectedPhone.assigned_user_id || ''} onValueChange={(value) => setSelectedPhone({
                  ...selectedPhone, assigned_user_id: value, missed_call_owner_user_id: value,
                })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o titular" /></SelectTrigger>
                  <SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Se o titular não atender em 15 segundos, a chamada segue diretamente para o fallback.</p>
              </div>
            )}
            </section>

            <section className="space-y-4 border-t pt-8">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">2. Pessoas e permissões</p>
                  <h3 className="mt-1 text-base font-semibold">Quem atende e quem pode ligar</h3>
                  <p className="mt-1 text-sm text-muted-foreground">As duas autorizações são independentes para números corporativos.</p>
                </div>
                <div className="relative w-full md:w-72">
                  <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Buscar usuário"
                    className="pl-9"
                  />
                </div>
              </div>

              {selectedPhone.number_type === 'company' && receiveCount === users.length && users.length > 1 && (
                <Alert className="border-amber-500/40 bg-amber-500/5">
                  <WarningCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription>
                    Todos os {users.length} usuários ativos estão autorizados a receber este número. Revise a lista antes de usar em produção.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="overflow-hidden rounded-xl border">
                  <div className="flex items-start justify-between gap-3 border-b bg-muted/30 p-4">
                    <div>
                      <div className="flex items-center gap-2 font-semibold"><PhoneCall className="h-5 w-5 text-primary" /> Receber chamadas</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedPhone.number_type === 'company' ? 'Participa do round-robin deste número.' : 'Exclusivo para o titular.'}
                      </p>
                    </div>
                    <Badge variant="secondary">{receiveCount}</Badge>
                  </div>
                  {selectedPhone.number_type === 'company' ? (
                    <>
                      <div className="flex gap-2 border-b px-4 py-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => updateAllGrants('can_receive_calls', true)}>Selecionar todos</Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => updateAllGrants('can_receive_calls', false)}>Limpar</Button>
                      </div>
                      <div className="max-h-96 divide-y overflow-y-auto">
                        {filteredUsers.map((user) => {
                          const grant = selectedPhone.grants.find((item) => item.user_id === user.id);
                          return (
                            <div key={user.id} className="flex items-center justify-between gap-3 p-3">
                              <div className="min-w-0"><p className="truncate text-sm font-medium">{user.full_name}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div>
                              <Switch checked={grant?.can_receive_calls === true} onCheckedChange={(value) => updateGrant(user.id, 'can_receive_calls', value)} />
                            </div>
                          );
                        })}
                        {filteredUsers.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</p>}
                      </div>
                    </>
                  ) : (
                    <div className="p-4 text-sm text-muted-foreground">
                      Selecione o titular acima. Nenhum colega receberá chamadas deste número.
                    </div>
                  )}
                </div>

                <div className="overflow-hidden rounded-xl border">
                  <div className="flex items-start justify-between gap-3 border-b bg-muted/30 p-4">
                    <div>
                      <div className="flex items-center gap-2 font-semibold"><PhoneOutgoing className="h-5 w-5 text-primary" /> Realizar chamadas</div>
                      <p className="mt-1 text-xs text-muted-foreground">Pode escolher este número ao ligar pelo CRM.</p>
                    </div>
                    <Badge variant="secondary">{originateCount}</Badge>
                  </div>
                  <div className="flex gap-2 border-b px-4 py-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => updateAllGrants('can_originate_calls', true)}>Selecionar todos</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => updateAllGrants('can_originate_calls', false)}>Limpar</Button>
                  </div>
                  <div className="max-h-96 divide-y overflow-y-auto">
                    {filteredUsers.map((user) => {
                      const grant = selectedPhone.grants.find((item) => item.user_id === user.id);
                      const isOwner = selectedPhone.number_type === 'user' && selectedPhone.assigned_user_id === user.id;
                      return (
                        <div key={user.id} className="flex items-center justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2"><p className="truncate text-sm font-medium">{user.full_name}</p>{isOwner && <Badge variant="outline" className="text-[10px]">Titular</Badge>}</div>
                            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                          </div>
                          <Switch disabled={isOwner} checked={isOwner || grant?.can_originate_calls === true} onCheckedChange={(value) => updateGrant(user.id, 'can_originate_calls', value)} />
                        </div>
                      );
                    })}
                    {filteredUsers.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</p>}
                  </div>
                </div>
              </div>

              {selectedPhone.number_type === 'company' && (
                <div className="grid gap-3 rounded-lg bg-muted/40 p-4 text-sm md:grid-cols-3">
                  <span className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Até 3 pessoas distintas</span>
                  <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> 15 segundos por tentativa</span>
                  <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Só usuários online e disponíveis</span>
                </div>
              )}
            </section>

            <section className="space-y-4 border-t pt-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">3. Operação do número</p>
                <h3 className="mt-1 text-base font-semibold">Status, saída e gravação</h3>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>Número ativo</Label><Switch checked={selectedPhone.is_active} onCheckedChange={(value) => setSelectedPhone({ ...selectedPhone, is_active: value })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>Saída corporativa padrão</Label><Switch disabled={selectedPhone.number_type === 'user'} checked={selectedPhone.number_type === 'company' && selectedPhone.is_default_outbound} onCheckedChange={(value) => setSelectedPhone({ ...selectedPhone, is_default_outbound: value })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>Gravar chamadas</Label><Switch checked={selectedPhone.recording_enabled} onCheckedChange={(value) => setSelectedPhone({ ...selectedPhone, recording_enabled: value })} />
              </div>
              </div>
            </section>

            <section className="space-y-5 border-t pt-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">4. Horário e contingência</p>
                <h3 className="mt-1 text-base font-semibold">Quando atender e o que fazer se ninguém atender</h3>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div><Label>Horário de atendimento</Label><p className="mt-1 text-xs text-muted-foreground">Fora do horário, a mensagem e a tarefa são executadas imediatamente.</p></div>
                <Switch checked={selectedPhone.business_hours.enabled} onCheckedChange={(value) => setSelectedPhone({
                  ...selectedPhone, business_hours: { ...selectedPhone.business_hours, enabled: value },
                })} />
              </div>
              {selectedPhone.business_hours.enabled && (
                <div className="space-y-3 rounded-xl border p-4">
                  <div className="flex items-center justify-between"><Label>Dias e faixas de atendimento</Label><Badge variant="outline">{selectedPhone.timezone || organization?.timezone || 'America/Sao_Paulo'}</Badge></div>
                  {WEEKDAYS.map(([day, label]) => {
                    const segment = selectedPhone.business_hours.schedule[day]?.[0];
                    return (
                      <div key={day} className="grid grid-cols-[100px_1fr_1fr] items-center gap-3">
                        <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!segment} onCheckedChange={(value) => updateScheduleDay(day, value === true, segment?.start, segment?.end)} />{label}</label>
                        <Input aria-label={`Início de ${label}`} type="time" disabled={!segment} value={segment?.start || '09:00'} onChange={(event) => updateScheduleDay(day, true, event.target.value, segment?.end)} />
                        <Input aria-label={`Fim de ${label}`} type="time" disabled={!segment} value={segment?.end || '18:00'} onChange={(event) => updateScheduleDay(day, true, segment?.start, event.target.value)} />
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Mensagem de espera na transferência</Label>
                  <Textarea value={selectedPhone.hold_message} onChange={(event) => setSelectedPhone({ ...selectedPhone, hold_message: event.target.value })} rows={4} />
                  <p className="text-xs text-muted-foreground">Tocada somente enquanto o cliente aguarda na fila privada.</p>
                </div>
                <div className="space-y-2">
                  <Label>Mensagem de indisponibilidade</Label>
                  <Textarea value={selectedPhone.fallback_message} onChange={(event) => setSelectedPhone({ ...selectedPhone, fallback_message: event.target.value })} rows={4} />
                </div>
                <div className="rounded-xl border bg-muted/30 p-4 text-sm md:col-span-2">
                  <p className="font-medium">Fluxo de fallback</p>
                  <ol className="mt-3 space-y-2 text-muted-foreground">
                    <li>1. Reproduz a mensagem ao cliente.</li>
                    <li>2. Encerra a ligação sem repetir destinatários.</li>
                    <li>3. Cria uma única tarefa para o responsável.</li>
                  </ol>
                </div>
              </div>
            </section>

            {/* Inbound Settings Section */}
            <section className="space-y-4 border-t pt-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">5. Contatos desconhecidos</p>
                <h3 className="mt-1 flex items-center gap-2 text-base font-semibold"><UserPlus className="h-5 w-5" /> Cadastro automático</h3>
              </div>
              
              {/* Auto Create Contact */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="autoCreate">Criar contato automaticamente</Label>
                  <p className="text-xs text-muted-foreground">
                    Quando alguém liga de um número não cadastrado
                  </p>
                </div>
                <Switch
                  id="autoCreate"
                  checked={selectedPhone.inbound_settings?.auto_create_contact ?? true}
                  onCheckedChange={(checked) => updateInboundSetting('auto_create_contact', checked)}
                />
              </div>

              {/* Default Lifecycle Stage */}
              {selectedPhone.inbound_settings?.auto_create_contact && (
                <div className="space-y-2">
                  <Label>Estágio do ciclo de vida para novos contatos</Label>
                  <Select
                    value={selectedPhone.inbound_settings?.default_lifecycle_stage || 'lead'}
                    onValueChange={(value) => updateInboundSetting('default_lifecycle_stage', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="subscriber">Subscriber</SelectItem>
                      <SelectItem value="opportunity">Opportunity</SelectItem>
                      <SelectItem value="customer">Customer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </section>

            {/* Save Button */}
            <div className="sticky bottom-3 z-10 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
            <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
              {saving ? (
                 <SpinnerGap className="h-4 w-4 animate-spin mr-2" />
              ) : (
                 <FloppyDisk className="h-4 w-4 mr-2" />
              )}
              Salvar configuração do número
            </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
    </div>
  );
}

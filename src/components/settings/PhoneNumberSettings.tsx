import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { SpinnerGap, Phone, FloppyDisk, Users, UserPlus } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { telephonySupabase } from '@/integrations/supabase/telephonyClient';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from 'sonner';
import { formatPhoneDisplay } from '@/lib/phoneUtils';

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
        number_type: phone.number_type || (phone.assigned_user_id ? 'user' : 'company'),
        assigned_user_id: phone.assigned_user_id,
        is_active: phone.is_active ?? true,
        is_default_outbound: phone.is_default_outbound ?? phone.is_primary ?? false,
        recording_enabled: phone.recording_enabled ?? false,
        timezone: phone.timezone,
        business_hours: phone.business_hours || defaultBusinessHours(),
        max_attempts: phone.number_type === 'user' ? 1 : (phone.max_attempts || 3),
        fallback_message: phone.fallback_message || 'No momento não podemos atender. Registramos sua ligação e retornaremos em breve.',
        missed_call_owner_user_id: phone.missed_call_owner_user_id,
        grants: (grants || []).filter((grant) => grant.phone_number_id === phone.id),
      }));
      
      setPhoneNumbers(phoneList);
      
      if (phoneList.length > 0) {
        setSelectedPhone(phoneList[0]);
      }

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
      toast.error('Erro ao salvar configurações');
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Configuração de Chamadas
          </CardTitle>
          <CardDescription>
            Nenhum número de telefone configurado. Conecte a integração Twilio Voice primeiro.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Configuração de Chamadas Recebidas
        </CardTitle>
        <CardDescription>
          Configure como as chamadas recebidas serão roteadas para sua equipe
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Phone Number Selection (for future multi-number support) */}
        {phoneNumbers.length > 1 && (
          <div className="space-y-2">
            <Label>Número</Label>
            <Select
              value={selectedPhone?.id}
              onValueChange={(id) => {
                const phone = phoneNumbers.find(p => p.id === id);
                if (phone) setSelectedPhone(phone);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {phoneNumbers.map(phone => (
                  <SelectItem key={phone.id} value={phone.id}>
                    {phone.friendly_name || formatPhoneDisplay(phone.phone_number)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedPhone && (
          <>
            {/* Phone Info */}
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Número</p>
              <p className="text-lg font-medium">{formatPhoneDisplay(selectedPhone.phone_number)}</p>
            </div>

            {/* Friendly Name */}
            <div className="space-y-2">
              <Label htmlFor="friendlyName">Nome amigável</Label>
              <Input
                id="friendlyName"
                value={selectedPhone.friendly_name || ''}
                onChange={(e) => setSelectedPhone({
                  ...selectedPhone,
                  friendly_name: e.target.value
                })}
                placeholder="Ex: Vendas, Suporte, Principal"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
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
              </div>
              <div className="space-y-2">
                <Label>Responsável por chamadas perdidas</Label>
                <Select value={selectedPhone.missed_call_owner_user_id || ''} onValueChange={(value) => setSelectedPhone({
                  ...selectedPhone, missed_call_owner_user_id: value,
                })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {selectedPhone.number_type === 'user' && (
              <div className="space-y-2">
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

            <div className="space-y-3">
                <Label className="flex items-center gap-2"><Users className="h-4 w-4" /> Autorizações por usuário</Label>
                <div className="border rounded-lg divide-y">
                  <div className="grid grid-cols-[1fr_90px_90px] gap-2 p-2 text-xs text-muted-foreground">
                    <span>Usuário</span><span className="text-center">Receber</span><span className="text-center">Realizar</span>
                  </div>
                  {users.map((user) => {
                    const grant = selectedPhone.grants.find((item) => item.user_id === user.id);
                    return (
                      <div key={user.id} className="grid grid-cols-[1fr_90px_90px] items-center gap-2 p-3">
                        <div><p className="font-medium">{user.full_name}</p><p className="text-xs text-muted-foreground">{user.email}</p></div>
                        <Checkbox
                          className="mx-auto"
                          disabled={selectedPhone.number_type === 'user'}
                          checked={selectedPhone.number_type === 'user' ? selectedPhone.assigned_user_id === user.id : grant?.can_receive_calls === true}
                          onCheckedChange={(value) => updateGrant(user.id, 'can_receive_calls', value === true)}
                        />
                        <Checkbox className="mx-auto" checked={grant?.can_originate_calls === true} onCheckedChange={(value) => updateGrant(user.id, 'can_originate_calls', value === true)} />
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedPhone.number_type === 'company'
                    ? 'O round-robin tenta até três usuários disponíveis, por 15 segundos cada.'
                    : 'Somente o titular recebe. A permissão Realizar permite que outros usuários autorizados usem este número na saída.'}
                </p>
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

            <div className="border-t pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div><h3 className="font-semibold">Horário de atendimento</h3><p className="text-xs text-muted-foreground">Fora do horário, o fallback é executado imediatamente.</p></div>
                <Switch checked={selectedPhone.business_hours.enabled} onCheckedChange={(value) => setSelectedPhone({
                  ...selectedPhone, business_hours: { ...selectedPhone.business_hours, enabled: value },
                })} />
              </div>
              {selectedPhone.business_hours.enabled && WEEKDAYS.map(([day, label]) => {
                const segment = selectedPhone.business_hours.schedule[day]?.[0];
                return (
                  <div key={day} className="grid grid-cols-[100px_1fr_1fr] items-center gap-3">
                    <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!segment} onCheckedChange={(value) => updateScheduleDay(day, value === true, segment?.start, segment?.end)} />{label}</label>
                    <Input type="time" disabled={!segment} value={segment?.start || '09:00'} onChange={(event) => updateScheduleDay(day, true, event.target.value, segment?.end)} />
                    <Input type="time" disabled={!segment} value={segment?.end || '18:00'} onChange={(event) => updateScheduleDay(day, true, segment?.start, event.target.value)} />
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label>Mensagem de indisponibilidade</Label>
              <Textarea value={selectedPhone.fallback_message} onChange={(event) => setSelectedPhone({ ...selectedPhone, fallback_message: event.target.value })} rows={3} />
              <p className="text-xs text-muted-foreground">Após a mensagem, uma tarefa de retorno é criada para o responsável definido acima.</p>
            </div>

            {/* Inbound Settings Section */}
            <div className="border-t pt-6 space-y-4">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold">Números Desconhecidos</h3>
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
            </div>

            {/* Save Button */}
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? (
                 <SpinnerGap className="h-4 w-4 animate-spin mr-2" />
              ) : (
                 <FloppyDisk className="h-4 w-4 mr-2" />
              )}
              Salvar Configurações
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

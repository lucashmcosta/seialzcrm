import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Loader2, Phone, Save, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from 'sonner';
import { formatPhoneDisplay } from '@/lib/phoneUtils';

interface PhoneNumber {
  id: string;
  phone_number: string;
  friendly_name: string | null;
  ring_strategy: string;
  ring_users: string[];
  ring_timeout_seconds: number;
}

interface User {
  id: string;
  full_name: string;
  email: string;
}

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
      const { data: phones, error: phonesError } = await supabase
        .from('organization_phone_numbers')
        .select('*')
        .eq('organization_id', organization.id)
        .order('is_primary', { ascending: false });

      if (phonesError) throw phonesError;

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

      const phoneList = phones || [];
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

    setSaving(true);
    try {
      const { error } = await supabase
        .from('organization_phone_numbers')
        .update({
          friendly_name: selectedPhone.friendly_name,
          ring_strategy: selectedPhone.ring_strategy,
          ring_users: selectedPhone.ring_users,
          ring_timeout_seconds: selectedPhone.ring_timeout_seconds,
        })
        .eq('id', selectedPhone.id);

      if (error) throw error;

      toast.success('Configurações salvas com sucesso');
      fetchData();
    } catch (error) {
      console.error('Error saving phone settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleUserToggle = (userId: string) => {
    if (!selectedPhone) return;

    const currentUsers = selectedPhone.ring_users || [];
    const newUsers = currentUsers.includes(userId)
      ? currentUsers.filter(id => id !== userId)
      : [...currentUsers, userId];

    setSelectedPhone({
      ...selectedPhone,
      ring_users: newUsers
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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

            {/* Ring Strategy */}
            <div className="space-y-2">
              <Label>Estratégia de toque</Label>
              <Select
                value={selectedPhone.ring_strategy}
                onValueChange={(value) => setSelectedPhone({
                  ...selectedPhone,
                  ring_strategy: value
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    Tocar para todos os usuários
                  </SelectItem>
                  <SelectItem value="specific_users">
                    Tocar apenas para usuários selecionados
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {selectedPhone.ring_strategy === 'all' 
                  ? 'Todos os usuários da organização receberão chamadas'
                  : 'Apenas os usuários selecionados abaixo receberão chamadas'}
              </p>
            </div>

            {/* User Selection (only for specific_users strategy) */}
            {selectedPhone.ring_strategy === 'specific_users' && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Usuários que recebem chamadas
                </Label>
                <div className="border rounded-lg divide-y">
                  {users.map(user => (
                    <div 
                      key={user.id} 
                      className="flex items-center gap-3 p-3 hover:bg-muted/50"
                    >
                      <Checkbox
                        id={`user-${user.id}`}
                        checked={(selectedPhone.ring_users || []).includes(user.id)}
                        onCheckedChange={() => handleUserToggle(user.id)}
                      />
                      <label 
                        htmlFor={`user-${user.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <p className="font-medium">{user.full_name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </label>
                    </div>
                  ))}
                </div>
                {(selectedPhone.ring_users || []).length === 0 && (
                  <p className="text-sm text-destructive">
                    Selecione pelo menos um usuário para receber chamadas
                  </p>
                )}
              </div>
            )}

            {/* Ring Timeout */}
            <div className="space-y-2">
              <Label htmlFor="timeout">Tempo de toque (segundos)</Label>
              <Input
                id="timeout"
                type="number"
                min={10}
                max={60}
                value={selectedPhone.ring_timeout_seconds || 30}
                onChange={(e) => setSelectedPhone({
                  ...selectedPhone,
                  ring_timeout_seconds: parseInt(e.target.value) || 30
                })}
              />
              <p className="text-xs text-muted-foreground">
                Tempo que a chamada tocará antes de tocar mensagem de indisponibilidade
              </p>
            </div>

            {/* Save Button */}
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Configurações
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

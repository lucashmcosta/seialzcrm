import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { PhoneCall, Moon } from '@phosphor-icons/react';
import { useOrganization } from '@/hooks/useOrganization';
import { telephonySupabase } from '@/integrations/supabase/telephonyClient';
import { toast } from 'sonner';

export function TelephonyAvailabilitySettings() {
  const { organization, userProfile } = useOrganization();
  const [receiveCalls, setReceiveCalls] = useState(true);
  const [dndUntil, setDndUntil] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!organization?.id || !userProfile?.id) return;
    void (async () => {
      const { data } = await telephonySupabase.from('telephony_user_settings')
        .select('receive_calls_enabled, dnd_until')
        .eq('organization_id', organization.id).eq('user_id', userProfile.id).maybeSingle();
      if (data) {
        setReceiveCalls(data.receive_calls_enabled ?? true);
        setDndUntil(data.dnd_until);
      }
    })();
  }, [organization?.id, userProfile?.id]);

  const save = async (nextReceive: boolean, nextDnd: string | null) => {
    if (!organization?.id || !userProfile?.id) return;
    setSaving(true);
    const { error } = await telephonySupabase.from('telephony_user_settings').upsert({
      organization_id: organization.id,
      user_id: userProfile.id,
      receive_calls_enabled: nextReceive,
      dnd_until: nextDnd,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,user_id' });
    setSaving(false);
    if (error) return toast.error('Não foi possível atualizar sua disponibilidade');
    setReceiveCalls(nextReceive);
    setDndUntil(nextDnd);
    toast.success('Disponibilidade atualizada');
  };

  const dndActive = !!dndUntil && new Date(dndUntil).getTime() > Date.now();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PhoneCall className="h-5 w-5" /> Minha disponibilidade</CardTitle>
        <CardDescription>O roteamento também exige que este navegador esteja conectado recentemente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Participar das chamadas recebidas</Label>
          <Switch checked={receiveCalls} disabled={saving} onCheckedChange={(value) => void save(value, dndUntil)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={dndActive ? 'default' : 'outline'} disabled={saving || !receiveCalls} onClick={() => void save(receiveCalls, new Date(Date.now() + 60 * 60_000).toISOString())}>
            <Moon className="mr-2 h-4 w-4" /> Não perturbe por 1 hora
          </Button>
          {dndActive && <Button variant="ghost" disabled={saving} onClick={() => void save(receiveCalls, null)}>Voltar a receber</Button>}
          {dndActive && <span className="text-xs text-muted-foreground">Até {new Date(dndUntil!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

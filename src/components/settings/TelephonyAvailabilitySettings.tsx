import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { getUiLocale, uiDateLocale, uiText, useUiLocale } from '@/lib/ui-locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PhoneCall, Moon } from '@phosphor-icons/react';
import { useOrganization } from '@/hooks/useOrganization';
import { telephonySupabase } from '@/integrations/supabase/telephonyClient';
import { toast } from 'sonner';
import { useOutboundCall } from '@/contexts/OutboundCallContext';

export function TelephonyAvailabilitySettings() {
  const { organization, userProfile } = useOrganization();
  useUiLocale();
  const { isDeviceReady, errorMessage } = useOutboundCall();
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
    if (error) return toast.error(uiText('Não foi possível atualizar sua disponibilidade'));
    setReceiveCalls(nextReceive);
    setDndUntil(nextDnd);
    toast.success(uiText('Disponibilidade atualizada'));
  };

  const dndActive = !!dndUntil && new Date(dndUntil).getTime() > Date.now();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2"><PhoneCall className="h-5 w-5" /> {uiText("Minha disponibilidade")}</CardTitle>
          <Badge variant={isDeviceReady ? 'default' : 'destructive'}>{isDeviceReady ? uiText('Navegador pronto') : uiText('Telefonia offline')}</Badge>
        </div>
        <CardDescription>{uiText("O roteamento também exige que este navegador esteja conectado recentemente.")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isDeviceReady && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage || uiText('Este navegador não está registrado para receber chamadas. Atualize a página.')}</AlertDescription>
          </Alert>
        )}
        <div className="flex items-center justify-between">
          <Label>{uiText("Participar das chamadas recebidas")}</Label>
          <Switch checked={receiveCalls} disabled={saving} onCheckedChange={(value) => void save(value, dndUntil)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={dndActive ? 'default' : 'outline'} disabled={saving || !receiveCalls} onClick={() => void save(receiveCalls, new Date(Date.now() + 60 * 60_000).toISOString())}>
            <Moon className="mr-2 h-4 w-4" /> {uiText("Não perturbe por 1 hora")}
          </Button>
          {dndActive && <Button variant="ghost" disabled={saving} onClick={() => void save(receiveCalls, null)}>{uiText("Voltar a receber")}</Button>}
          {dndActive && <span className="text-xs text-muted-foreground">{uiText('Até {0}', { 0: format(new Date(dndUntil!), getUiLocale() === 'en-US' ? 'h:mm a' : 'HH:mm', { locale: uiDateLocale() }) })}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

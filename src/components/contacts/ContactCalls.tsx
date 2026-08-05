import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useVoiceIntegration } from '@/hooks/useVoiceIntegration';
import { useOutboundCall } from '@/contexts/OutboundCallContext';
import { useTranslation } from '@/lib/i18n';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { telephonySupabase } from '@/integrations/supabase/telephonyClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { SpinnerGap, Phone, PhoneIncoming, PhoneOutgoing, Calendar, Plus, User, Clock } from '@phosphor-icons/react';
import { CallStatusBadge } from '@/components/calls/CallStatusBadge';
import { CallRecordingPlayer } from '@/components/calls/CallRecordingPlayer';
import { ScheduleCallDialog } from '@/components/calls/ScheduleCallDialog';
import { usePermissions } from '@/hooks/usePermissions';

interface Call {
  id: string;
  direction: 'outgoing' | 'incoming';
  status: string;
  call_type: string;
  started_at: string;
  scheduled_at: string | null;
  duration_seconds: number | null;
  notes: string | null;
  to_number: string | null;
  created_at: string;
  call_recordings?: { id: string; recording_url: string; duration_seconds: number | null }[];
  user?: { full_name: string } | null;
}

interface ContactCallsProps {
  contactId: string;
  opportunityId?: string;
  contactPhone?: string;
  contactName?: string;
}

interface VoiceNumberOption {
  id: string;
  phone_number: string;
  friendly_name: string | null;
  number_type: 'company' | 'user';
  is_default_outbound: boolean;
}

export function ContactCalls({ contactId, opportunityId, contactPhone, contactName }: ContactCallsProps) {
  const { organization, locale, userProfile } = useOrganization();
  const { hasVoiceIntegration } = useVoiceIntegration();
  const { startCall, telephonyV2 } = useOutboundCall();
  const { permissions } = usePermissions();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'made' | 'received' | 'scheduled'>('all');
  const [voiceNumbers, setVoiceNumbers] = useState<VoiceNumberOption[]>([]);
  const [selectedVoiceNumberId, setSelectedVoiceNumberId] = useState<string | undefined>();
  const [formData, setFormData] = useState({
    direction: 'outgoing' as 'outgoing' | 'incoming',
    status: 'completed',
    duration_seconds: '',
    notes: '',
  });
  const canStartVoiceCall = hasVoiceIntegration && (!telephonyV2 || permissions.canMakeCalls);

  useEffect(() => {
    fetchCalls();
  }, [contactId, organization?.id]);

  useEffect(() => {
    if (!telephonyV2 || !organization?.id || !userProfile?.id) {
      setVoiceNumbers([]);
      setSelectedVoiceNumberId(undefined);
      return;
    }
    void (async () => {
      const { data: allNumbers } = await telephonySupabase.from('organization_phone_numbers')
        .select('id, phone_number, friendly_name, number_type, assigned_user_id, is_default_outbound')
        .eq('organization_id', organization.id).eq('is_active', true);
      const { data: grants } = await telephonySupabase.from('organization_phone_number_users')
        .select('phone_number_id').eq('organization_id', organization.id)
        .eq('user_id', userProfile.id).eq('can_originate_calls', true);
      const grantedIds = new Set((grants || []).map((grant) => grant.phone_number_id));
      const allowed = (allNumbers || []).filter((number) =>
        (number.number_type === 'user' && number.assigned_user_id === userProfile.id) || grantedIds.has(number.id)
      ) as VoiceNumberOption[];
      allowed.sort((a, b) => Number(b.number_type === 'user') - Number(a.number_type === 'user') || Number(b.is_default_outbound) - Number(a.is_default_outbound));
      setVoiceNumbers(allowed);
      setSelectedVoiceNumberId(allowed[0]?.id);
    })();
  }, [telephonyV2, organization?.id, userProfile?.id]);

  const fetchCalls = async () => {
    if (!organization?.id) return;

    try {
      const { data, error } = await supabase
        .from('calls')
        .select(`
          *,
          call_recordings(id, recording_url, duration_seconds),
          user:users!user_id(full_name)
        `)
        .eq('organization_id', organization.id)
        .eq('contact_id', contactId)
        .is('deleted_at', null)
        .order('started_at', { ascending: false });

      if (error) throw error;
      setCalls((data as any) || []);
    } catch (error) {
      console.error('Error fetching calls:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !userProfile?.id) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('calls')
        .insert({
          organization_id: organization.id,
          contact_id: contactId,
          opportunity_id: opportunityId || null,
          user_id: userProfile.id,
          direction: formData.direction,
          status: formData.status,
          call_type: formData.direction === 'outgoing' ? 'made' : 'received',
          duration_seconds: formData.duration_seconds ? parseInt(formData.duration_seconds) : null,
          notes: formData.notes || null,
          started_at: new Date().toISOString(),
        });

      if (error) throw error;

      await supabase.from('activities').insert({
        organization_id: organization.id,
        contact_id: contactId,
        opportunity_id: opportunityId || null,
        activity_type: 'call',
        title: `${formData.direction === 'outgoing' ? 'Ligação realizada' : 'Ligação recebida'}`,
        body: formData.notes,
        created_by_user_id: userProfile.id,
        occurred_at: new Date().toISOString(),
      });

      toast({ description: 'Chamada registrada com sucesso' });
      setDialogOpen(false);
      setFormData({ direction: 'outgoing', status: 'completed', duration_seconds: '', notes: '' });
      fetchCalls();
    } catch (error) {
      console.error('Error logging call:', error);
      toast({ variant: 'destructive', description: t('common.error') });
    } finally {
      setSubmitting(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDateWithTimezone = (dateString: string) => {
    const timezone = organization?.timezone || 'America/Sao_Paulo';
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    }).format(new Date(dateString));
  };

  const filteredCalls = calls.filter((call) => {
    if (filter === 'all') return true;
    if (filter === 'made') return call.call_type === 'made' || (call.direction === 'outgoing' && call.call_type !== 'scheduled');
    if (filter === 'received') return call.call_type === 'received' || call.direction === 'incoming';
    if (filter === 'scheduled') return call.call_type === 'scheduled';
    return true;
  });

  const getCallIcon = (call: Call) => {
    if (call.call_type === 'scheduled') return <Calendar className="w-4 h-4" />;
    if (call.direction === 'outgoing') return <PhoneOutgoing className="w-4 h-4" />;
    return <PhoneIncoming className="w-4 h-4" />;
  };

  const getCallTitle = (call: Call) => {
    if (call.call_type === 'scheduled') return 'Chamada agendada';
    if (call.direction === 'outgoing') return 'Ligação realizada';
    return 'Ligação recebida';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <SpinnerGap className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className={isMobile ? 'px-3 py-3' : undefined}>
        <div className={isMobile ? 'flex flex-col gap-3' : 'flex items-center justify-between'}>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-5 w-5" />
            Chamadas
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {contactPhone && canStartVoiceCall && (
              <>
                {telephonyV2 && voiceNumbers.length > 1 && (
                  <Select value={selectedVoiceNumberId} onValueChange={setSelectedVoiceNumberId}>
                    <SelectTrigger className="h-9 w-[190px]"><SelectValue placeholder="Número de saída" /></SelectTrigger>
                    <SelectContent>{voiceNumbers.map((number) => (
                      <SelectItem key={number.id} value={number.id}>{number.friendly_name || number.phone_number}</SelectItem>
                    ))}</SelectContent>
                  </Select>
                )}
                <Button size="sm" onClick={() => startCall({ 
                  phoneNumber: contactPhone, 
                  contactName, 
                  contactId, 
                  opportunityId,
                  phoneNumberId: selectedVoiceNumberId,
                })}>
                  <Phone className="w-4 h-4 mr-1" />
                  Ligar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setScheduleDialogOpen(true)}>
                  <Calendar className="w-4 h-4 mr-1" />
                  Agendar
                </Button>
              </>
            )}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="w-4 h-4 mr-1" />
                  Registrar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleSubmit}>
                  <DialogHeader>
                    <DialogTitle>Registrar Chamada</DialogTitle>
                    <DialogDescription>Registre uma chamada manual com este contato</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="direction">Direção</Label>
                      <Select value={formData.direction} onValueChange={(value: any) => setFormData({ ...formData, direction: value })}>
                        <SelectTrigger id="direction">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="outgoing">Realizada</SelectItem>
                          <SelectItem value="incoming">Recebida</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                        <SelectTrigger id="status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="completed">Concluída</SelectItem>
                          <SelectItem value="no-answer">Não atendeu</SelectItem>
                          <SelectItem value="busy">Ocupado</SelectItem>
                          <SelectItem value="failed">Falhou</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="duration">Duração (segundos)</Label>
                      <Input
                        id="duration"
                        type="number"
                        value={formData.duration_seconds}
                        onChange={(e) => setFormData({ ...formData, duration_seconds: e.target.value })}
                        placeholder="120"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notas</Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        rows={3}
                        placeholder="Notas da chamada..."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={submitting}>
                      {submitting && <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />}
                      Salvar
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        
        <div className={`mt-2 ${isMobile ? 'overflow-x-auto -mx-3 px-3' : ''}`}>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList className={isMobile ? 'w-max' : ''}>
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="made">Feitas</TabsTrigger>
              <TabsTrigger value="received">Recebidas</TabsTrigger>
              <TabsTrigger value="scheduled">Agendadas</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {filteredCalls.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma chamada registrada</p>
          ) : (
            filteredCalls.map((call) => (
              <div key={call.id} className="flex items-start gap-3 p-3 rounded-lg border">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  {getCallIcon(call)}
                </div>
                  <div className="flex-1 min-w-0 space-y-2">
                  <div className={isMobile ? 'flex flex-col gap-0.5' : 'flex items-center justify-between'}>
                    <p className="font-medium text-foreground text-sm">{getCallTitle(call)}</p>
                    <span className="text-xs text-muted-foreground">
                      {call.scheduled_at 
                        ? `Agendada: ${formatDateWithTimezone(call.scheduled_at)}`
                        : formatDateWithTimezone(call.started_at)
                      }
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                    <CallStatusBadge status={call.status} />
                    {call.user?.full_name && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {call.user.full_name}
                      </span>
                    )}
                    {call.duration_seconds && call.status === 'completed' && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(call.duration_seconds)}
                      </span>
                    )}
                    {call.to_number && (
                      <span>{call.to_number}</span>
                    )}
                  </div>
                  {call.notes && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{call.notes}</p>
                  )}
                  {call.call_recordings && call.call_recordings.length > 0 && (
                    <div className="mt-2">
                      {call.call_recordings.map((rec) => (
                        <CallRecordingPlayer 
                          key={rec.id} 
                          recordingUrl={rec.recording_url} 
                          duration={rec.duration_seconds || undefined} 
                        />
                      ))}
                    </div>
                  )}
                  {call.call_type === 'scheduled' && call.status === 'queued' && contactPhone && canStartVoiceCall && (
                    <div className="mt-2">
                      <Button size="sm" onClick={() => startCall({ 
                        phoneNumber: contactPhone, 
                        contactName, 
                        contactId, 
                        opportunityId,
                        phoneNumberId: selectedVoiceNumberId,
                      })}>
                        <Phone className="w-4 h-4 mr-2" />
                        Ligar agora
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>

      {contactPhone && contactName && canStartVoiceCall && (
        <ScheduleCallDialog
          open={scheduleDialogOpen}
          onOpenChange={setScheduleDialogOpen}
          contactId={contactId}
          contactPhone={contactPhone}
          contactName={contactName}
          opportunityId={opportunityId}
          onSuccess={fetchCalls}
        />
      )}
    </Card>
  );
}

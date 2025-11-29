import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Phone, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';

interface Call {
  id: string;
  direction: 'outgoing' | 'incoming';
  status: string;
  started_at: string;
  duration_seconds: number | null;
  notes: string | null;
  created_at: string;
}

interface ContactCallsProps {
  contactId: string;
}

export function ContactCalls({ contactId }: ContactCallsProps) {
  const { organization, locale, userProfile } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    direction: 'outgoing' as 'outgoing' | 'incoming',
    status: 'completed',
    duration_seconds: '',
    notes: '',
  });

  useEffect(() => {
    fetchCalls();
  }, [contactId, organization?.id]);

  const fetchCalls = async () => {
    if (!organization?.id) return;

    try {
      const { data, error } = await supabase
        .from('calls')
        .select('*')
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
          user_id: userProfile.id,
          direction: formData.direction,
          status: formData.status,
          duration_seconds: formData.duration_seconds ? parseInt(formData.duration_seconds) : null,
          notes: formData.notes || null,
          started_at: new Date().toISOString(),
        });

      if (error) throw error;

      // Create activity
      await supabase.from('activities').insert({
        organization_id: organization.id,
        contact_id: contactId,
        activity_type: 'call',
        title: `${formData.direction === 'outgoing' ? 'Outgoing' : 'Incoming'} call`,
        body: formData.notes,
        created_by_user_id: userProfile.id,
        occurred_at: new Date().toISOString(),
      });

      toast({ description: 'Call logged successfully' });
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

  const dateLocale = locale === 'pt-BR' ? ptBR : enUS;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Calls</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Phone className="w-4 h-4 mr-2" />
                {t('activity.logCall')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>{t('activity.logCall')}</DialogTitle>
                  <DialogDescription>Record a call with this contact</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="direction">{t('activity.direction')}</Label>
                    <Select value={formData.direction} onValueChange={(value: any) => setFormData({ ...formData, direction: value })}>
                      <SelectTrigger id="direction">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outgoing">{t('activity.outgoing')}</SelectItem>
                        <SelectItem value="incoming">{t('activity.incoming')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="duration">{t('activity.duration')} (seconds)</Label>
                    <Input
                      id="duration"
                      type="number"
                      value={formData.duration_seconds}
                      onChange={(e) => setFormData({ ...formData, duration_seconds: e.target.value })}
                      placeholder="120"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">{t('activity.notes')}</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      placeholder="Call notes..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('common.save')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {calls.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No calls logged yet</p>
          ) : (
            calls.map((call) => (
              <div key={call.id} className="flex items-start gap-3 p-3 rounded-lg border">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  {call.direction === 'outgoing' ? (
                    <PhoneOutgoing className="w-4 h-4" />
                  ) : (
                    <PhoneIncoming className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-foreground">
                      {call.direction === 'outgoing' ? t('activity.outgoing') : t('activity.incoming')} call
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(call.started_at), { addSuffix: true, locale: dateLocale })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="text-xs">
                      {formatDuration(call.duration_seconds)}
                    </Badge>
                    <Badge variant="outline" className="text-xs capitalize">
                      {call.status}
                    </Badge>
                  </div>
                  {call.notes && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{call.notes}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

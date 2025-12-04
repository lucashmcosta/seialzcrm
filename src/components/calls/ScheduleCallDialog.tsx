import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from 'sonner';

interface ScheduleCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactPhone: string;
  contactName: string;
  opportunityId?: string;
  onSuccess?: () => void;
}

export function ScheduleCallDialog({
  open,
  onOpenChange,
  contactId,
  contactPhone,
  contactName,
  opportunityId,
  onSuccess,
}: ScheduleCallDialogProps) {
  const { organization, userProfile } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState('09:00');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !userProfile?.id || !date) return;

    setLoading(true);
    try {
      const [hours, minutes] = time.split(':').map(Number);
      const scheduledAt = new Date(date);
      scheduledAt.setHours(hours, minutes, 0, 0);

      // Create scheduled call record
      const { error: callError } = await supabase.from('calls').insert({
        organization_id: organization.id,
        contact_id: contactId,
        opportunity_id: opportunityId || null,
        user_id: userProfile.id,
        call_type: 'scheduled',
        direction: 'outgoing',
        status: 'queued',
        to_number: contactPhone,
        scheduled_at: scheduledAt.toISOString(),
        notes,
      });

      if (callError) throw callError;

      // Create reminder task
      await supabase.from('tasks').insert({
        organization_id: organization.id,
        contact_id: contactId,
        opportunity_id: opportunityId || null,
        assigned_user_id: userProfile.id,
        created_by_user_id: userProfile.id,
        title: `Ligar para ${contactName}`,
        description: notes || `Chamada agendada para ${contactPhone}`,
        task_type: 'call',
        due_at: scheduledAt.toISOString(),
        priority: 'medium',
        status: 'open',
      });

      toast.success('Chamada agendada com sucesso!');
      onOpenChange(false);
      setDate(undefined);
      setTime('09:00');
      setNotes('');
      onSuccess?.();
    } catch (error: any) {
      console.error('Error scheduling call:', error);
      toast.error('Erro ao agendar chamada', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Agendar Chamada</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Contato</Label>
              <p className="text-sm text-muted-foreground">{contactName} - {contactPhone}</p>
            </div>

            <div className="space-y-2">
              <Label>Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, 'PPP', { locale: ptBR }) : 'Selecione a data'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={date} onSelect={setDate} locale={ptBR} />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">Horário</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Objetivo da chamada..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !date}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Agendar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

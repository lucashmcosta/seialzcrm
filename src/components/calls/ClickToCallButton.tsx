import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Phone, PhoneCall, PhoneOff, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ClickToCallButtonProps {
  phoneNumber: string;
  contactId?: string;
  opportunityId?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function ClickToCallButton({
  phoneNumber,
  contactId,
  opportunityId,
  variant = 'outline',
  size = 'sm',
}: ClickToCallButtonProps) {
  const [status, setStatus] = useState<'idle' | 'calling' | 'ringing' | 'connected' | 'ended'>('idle');

  const handleCall = async () => {
    if (status !== 'idle' && status !== 'ended') return;

    setStatus('calling');

    try {
      const { data, error } = await supabase.functions.invoke('twilio-call', {
        body: {
          to: phoneNumber,
          contactId,
          opportunityId,
        },
      });

      if (error) throw error;

      if (data.success) {
        setStatus('ringing');
        toast.success('Ligando...', {
          description: 'Aguarde, sua chamada está sendo conectada.',
        });

        // Simulate status transitions (in production use WebSocket/polling)
        setTimeout(() => setStatus('connected'), 5000);
        setTimeout(() => {
          setStatus('ended');
          setTimeout(() => setStatus('idle'), 3000);
        }, 60000);
      } else {
        throw new Error(data.error || 'Erro ao iniciar chamada');
      }
    } catch (error: any) {
      console.error('Call error:', error);
      toast.error('Erro na chamada', {
        description: error.message || 'Não foi possível iniciar a chamada',
      });
      setStatus('idle');
    }
  };

  const getIcon = () => {
    switch (status) {
      case 'calling':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'ringing':
      case 'connected':
        return <PhoneCall className="h-4 w-4 text-green-500" />;
      case 'ended':
        return <PhoneOff className="h-4 w-4" />;
      default:
        return <Phone className="h-4 w-4" />;
    }
  };

  const getLabel = () => {
    switch (status) {
      case 'calling':
        return 'Iniciando...';
      case 'ringing':
        return 'Tocando...';
      case 'connected':
        return 'Em chamada';
      case 'ended':
        return 'Encerrada';
      default:
        return 'Ligar';
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleCall}
      disabled={status === 'calling' || status === 'ringing' || status === 'connected'}
      className={status === 'connected' ? 'bg-green-500 hover:bg-green-600 text-white' : ''}
    >
      {getIcon()}
      {size !== 'icon' && <span className="ml-2">{getLabel()}</span>}
    </Button>
  );
}

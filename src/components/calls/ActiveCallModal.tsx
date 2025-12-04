import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { DialPad } from './DialPad';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type CallStatus = 'initiating' | 'ringing' | 'connected' | 'ended' | 'failed';

interface ActiveCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneNumber: string;
  contactName?: string;
  contactId?: string;
  opportunityId?: string;
  onCallEnd?: () => void;
}

export function ActiveCallModal({
  open,
  onOpenChange,
  phoneNumber,
  contactName,
  contactId,
  opportunityId,
  onCallEnd,
}: ActiveCallModalProps) {
  const [status, setStatus] = useState<CallStatus>('initiating');
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [dtmfDigits, setDtmfDigits] = useState('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callSidRef = useRef<string | null>(null);

  // Start call when modal opens
  useEffect(() => {
    if (open) {
      initiateCall();
    } else {
      // Reset state when modal closes
      setStatus('initiating');
      setDuration(0);
      setIsMuted(false);
      setIsSpeaker(false);
      setDtmfDigits('');
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [open]);

  // Timer for call duration
  useEffect(() => {
    if (status === 'connected' && !timerRef.current) {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }

    if (status === 'ended' || status === 'failed') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current && (status === 'ended' || status === 'failed')) {
        clearInterval(timerRef.current);
      }
    };
  }, [status]);

  const initiateCall = async () => {
    setStatus('initiating');

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
        callSidRef.current = data.callSid;
        setStatus('ringing');
        toast.success('Chamada iniciada');

        // Simulate status transitions (in production, use webhooks/polling)
        setTimeout(() => {
          if (status !== 'ended' && status !== 'failed') {
            setStatus('connected');
          }
        }, 3000);
      } else {
        throw new Error(data.error || 'Erro ao iniciar chamada');
      }
    } catch (error: any) {
      console.error('Call error:', error);
      setStatus('failed');
      toast.error('Erro na chamada', {
        description: error.message || 'Não foi possível iniciar a chamada',
      });
    }
  };

  const handleEndCall = () => {
    setStatus('ended');
    onCallEnd?.();
    
    // Close modal after a brief delay
    setTimeout(() => {
      onOpenChange(false);
    }, 1500);
  };

  const handleDialPress = (digit: string) => {
    setDtmfDigits((prev) => prev + digit);
    // In production, send DTMF via Twilio API
    console.log('DTMF digit pressed:', digit);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusText = () => {
    switch (status) {
      case 'initiating':
        return 'Iniciando chamada...';
      case 'ringing':
        return 'Chamando...';
      case 'connected':
        return 'Em chamada';
      case 'ended':
        return 'Chamada encerrada';
      case 'failed':
        return 'Chamada falhou';
      default:
        return '';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'initiating':
      case 'ringing':
        return 'text-yellow-500';
      case 'connected':
        return 'text-green-500';
      case 'ended':
        return 'text-muted-foreground';
      case 'failed':
        return 'text-destructive';
      default:
        return 'text-foreground';
    }
  };

  const initials = contactName
    ? contactName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : phoneNumber.slice(-2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col items-center py-6 space-y-6">
          {/* Contact Info */}
          <div className="flex flex-col items-center space-y-3">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            {contactName && (
              <h3 className="text-xl font-semibold text-foreground">{contactName}</h3>
            )}
            <p className="text-muted-foreground">{phoneNumber}</p>
          </div>

          {/* Status & Timer */}
          <div className="flex flex-col items-center space-y-2">
            <p className={`text-sm font-medium ${getStatusColor()}`}>
              {getStatusText()}
            </p>
            {(status === 'connected' || status === 'ended') && (
              <p className="text-3xl font-mono font-semibold text-foreground">
                {formatDuration(duration)}
              </p>
            )}
            {status === 'ringing' && (
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse delay-150" />
                <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse delay-300" />
              </div>
            )}
          </div>

          {/* DTMF Display */}
          {dtmfDigits && (
            <p className="text-lg font-mono text-muted-foreground">{dtmfDigits}</p>
          )}

          {/* Dial Pad */}
          {status === 'connected' && (
            <DialPad onPress={handleDialPress} disabled={status !== 'connected'} />
          )}

          {/* Controls */}
          <div className="flex items-center gap-4">
            {status === 'connected' && (
              <>
                <Button
                  variant={isMuted ? 'default' : 'outline'}
                  size="icon"
                  className="h-12 w-12 rounded-full"
                  onClick={() => setIsMuted(!isMuted)}
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
                <Button
                  variant={isSpeaker ? 'default' : 'outline'}
                  size="icon"
                  className="h-12 w-12 rounded-full"
                  onClick={() => setIsSpeaker(!isSpeaker)}
                >
                  {isSpeaker ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                </Button>
              </>
            )}
          </div>

          {/* End Call Button */}
          {status !== 'ended' && status !== 'failed' && (
            <Button
              variant="destructive"
              size="lg"
              className="h-14 w-14 rounded-full"
              onClick={handleEndCall}
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
          )}

          {/* Close after failed */}
          {status === 'failed' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

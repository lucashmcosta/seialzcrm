import { useState, useEffect, useRef, useCallback } from 'react';
import { Device, Call } from '@twilio/voice-sdk';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { DialPad } from './DialPad';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type CallStatus = 'initializing' | 'ready' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'failed';

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
  const [status, setStatus] = useState<CallStatus>('initializing');
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true);
  const [dtmfDigits, setDtmfDigits] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Twilio Device
  const initializeDevice = useCallback(async () => {
    try {
      setStatus('initializing');
      setErrorMessage(null);

      // Get access token from our Edge Function
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Não autenticado');
      }

      const { data: tokenData, error: tokenError } = await supabase.functions.invoke('twilio-token');

      if (tokenError || !tokenData?.token) {
        console.error('Token error:', tokenError);
        throw new Error('Erro ao obter token de acesso');
      }

      console.log('Got access token, initializing device...');

      // Create and register the Device
      const device = new Device(tokenData.token, {
        codecPreferences: [Call.Codec.PCMU, Call.Codec.Opus],
        allowIncomingWhileBusy: false,
      });

      device.on('registered', () => {
        console.log('Twilio Device registered');
        setStatus('ready');
      });

      device.on('error', (error) => {
        console.error('Twilio Device error:', error);
        setErrorMessage(error.message || 'Erro no dispositivo de áudio');
        setStatus('failed');
      });

      device.on('unregistered', () => {
        console.log('Twilio Device unregistered');
      });

      await device.register();
      deviceRef.current = device;

    } catch (error: any) {
      console.error('Device initialization error:', error);
      setErrorMessage(error.message || 'Erro ao inicializar chamada');
      setStatus('failed');
    }
  }, []);

  // Make the call
  const makeCall = useCallback(async () => {
    if (!deviceRef.current || status !== 'ready') {
      console.log('Device not ready, status:', status);
      return;
    }

    try {
      setStatus('connecting');
      console.log('Connecting call to:', phoneNumber);

      const call = await deviceRef.current.connect({
        params: {
          To: phoneNumber,
        },
      });

      activeCallRef.current = call;

      // Call events
      call.on('ringing', () => {
        console.log('Call ringing');
        setStatus('ringing');
      });

      call.on('accept', () => {
        console.log('Call accepted/connected');
        setStatus('connected');
        toast.success('Chamada conectada');
      });

      call.on('disconnect', () => {
        console.log('Call disconnected');
        setStatus('ended');
        onCallEnd?.();
      });

      call.on('cancel', () => {
        console.log('Call cancelled');
        setStatus('ended');
      });

      call.on('reject', () => {
        console.log('Call rejected');
        setStatus('failed');
        setErrorMessage('Chamada rejeitada');
      });

      call.on('error', (error) => {
        console.error('Call error:', error);
        setErrorMessage(error.message || 'Erro na chamada');
        setStatus('failed');
      });

      // Record the call in our database
      try {
        const { data: userData } = await supabase.auth.getUser();
        const { data: userProfile } = await supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', userData.user?.id)
          .single();

        const { data: userOrg } = await supabase
          .from('user_organizations')
          .select('organization_id')
          .eq('user_id', userProfile?.id)
          .eq('is_active', true)
          .single();

        if (userOrg && userProfile) {
          await supabase.from('calls').insert({
            organization_id: userOrg.organization_id,
            user_id: userProfile.id,
            contact_id: contactId,
            opportunity_id: opportunityId,
            direction: 'outgoing',
            call_type: 'made',
            to_number: phoneNumber,
            status: 'queued',
            started_at: new Date().toISOString(),
          });
        }
      } catch (dbError) {
        console.error('Error recording call:', dbError);
      }

    } catch (error: any) {
      console.error('Call connection error:', error);
      setErrorMessage(error.message || 'Erro ao conectar chamada');
      setStatus('failed');
    }
  }, [phoneNumber, contactId, opportunityId, status, onCallEnd]);

  // Effect: Initialize device when modal opens
  useEffect(() => {
    if (open) {
      initializeDevice();
    }

    return () => {
      // Cleanup when modal closes
      if (activeCallRef.current) {
        activeCallRef.current.disconnect();
        activeCallRef.current = null;
      }
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setStatus('initializing');
      setDuration(0);
      setIsMuted(false);
      setDtmfDigits('');
      setErrorMessage(null);
    };
  }, [open, initializeDevice]);

  // Effect: Make call when device is ready
  useEffect(() => {
    if (status === 'ready' && open) {
      makeCall();
    }
  }, [status, open, makeCall]);

  // Effect: Timer for call duration
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
  }, [status]);

  // Handle end call
  const handleEndCall = () => {
    if (activeCallRef.current) {
      activeCallRef.current.disconnect();
    }
    setStatus('ended');
    
    setTimeout(() => {
      onOpenChange(false);
    }, 1500);
  };

  // Handle mute toggle (REAL)
  const handleToggleMute = () => {
    if (activeCallRef.current) {
      const newMuted = !isMuted;
      activeCallRef.current.mute(newMuted);
      setIsMuted(newMuted);
      toast(newMuted ? 'Microfone mutado' : 'Microfone ativado');
    }
  };

  // Handle speaker toggle
  const handleToggleSpeaker = () => {
    // Note: Speaker control is typically handled by the device/OS
    // This is a UI indicator that could be extended with Web Audio API
    setIsSpeaker(!isSpeaker);
    toast(isSpeaker ? 'Alto-falante desativado' : 'Alto-falante ativado');
  };

  // Handle DTMF (REAL)
  const handleDialPress = (digit: string) => {
    if (activeCallRef.current && status === 'connected') {
      activeCallRef.current.sendDigits(digit);
      setDtmfDigits((prev) => prev + digit);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusText = () => {
    switch (status) {
      case 'initializing':
        return 'Preparando...';
      case 'ready':
        return 'Conectando...';
      case 'connecting':
        return 'Iniciando chamada...';
      case 'ringing':
        return 'Chamando...';
      case 'connected':
        return 'Em chamada';
      case 'ended':
        return 'Chamada encerrada';
      case 'failed':
        return errorMessage || 'Chamada falhou';
      default:
        return '';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'initializing':
      case 'ready':
      case 'connecting':
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

  const isCallActive = status === 'connecting' || status === 'ringing' || status === 'connected';

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
            {(status === 'ringing' || status === 'connecting') && (
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
                  onClick={handleToggleMute}
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
                <Button
                  variant={isSpeaker ? 'default' : 'outline'}
                  size="icon"
                  className="h-12 w-12 rounded-full"
                  onClick={handleToggleSpeaker}
                >
                  {isSpeaker ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                </Button>
              </>
            )}
          </div>

          {/* End Call Button */}
          {isCallActive && (
            <Button
              variant="destructive"
              size="lg"
              className="h-14 w-14 rounded-full"
              onClick={handleEndCall}
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
          )}

          {/* Close after failed/ended */}
          {(status === 'failed' || status === 'ended') && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

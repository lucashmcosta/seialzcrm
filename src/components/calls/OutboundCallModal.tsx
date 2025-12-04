import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Minimize2 } from 'lucide-react';
import { DialPad } from './DialPad';
import { formatPhoneDisplay } from '@/lib/phoneUtils';
import { CallStatus } from '@/contexts/OutboundCallContext';

interface OutboundCallModalProps {
  open: boolean;
  phoneNumber: string;
  contactName?: string;
  status: CallStatus;
  duration: number;
  isMuted: boolean;
  dtmfDigits: string;
  errorMessage: string | null;
  onEndCall: () => void;
  onToggleMute: () => void;
  onDialPress: (digit: string) => void;
  onMinimize: () => void;
}

export function OutboundCallModal({
  open,
  phoneNumber,
  contactName,
  status,
  duration,
  isMuted,
  dtmfDigits,
  errorMessage,
  onEndCall,
  onToggleMute,
  onDialPress,
  onMinimize,
}: OutboundCallModalProps) {
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
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center py-6 space-y-6">
          {/* Minimize Button */}
          {isCallActive && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-12"
              onClick={onMinimize}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          )}

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
            <p className="text-muted-foreground">{formatPhoneDisplay(phoneNumber)}</p>
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
            <DialPad onPress={onDialPress} disabled={status !== 'connected'} />
          )}

          {/* Controls */}
          <div className="flex items-center gap-4">
            {status === 'connected' && (
              <Button
                variant={isMuted ? 'default' : 'outline'}
                size="icon"
                className="h-12 w-12 rounded-full"
                onClick={onToggleMute}
              >
                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </Button>
            )}
          </div>

          {/* End Call Button */}
          {isCallActive && (
            <Button
              variant="destructive"
              size="lg"
              className="h-14 w-14 rounded-full"
              onClick={onEndCall}
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
          )}

          {/* Close after failed/ended - will auto-close via context */}
          {(status === 'failed' || status === 'ended') && (
            <p className="text-sm text-muted-foreground">Fechando...</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

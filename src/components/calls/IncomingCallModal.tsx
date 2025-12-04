import { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Phone, PhoneOff, Mic, MicOff, User, Minimize2 } from 'lucide-react';
import { Call } from '@twilio/voice-sdk';
import { formatPhoneDisplay } from '@/lib/phoneUtils';
import { DialPad } from './DialPad';
import { MinimizedCallWidget } from './MinimizedCallWidget';

interface IncomingCallModalProps {
  isRinging: boolean;
  isOnCall: boolean;
  from: string;
  contactName?: string;
  contactId?: string;
  onAnswer: () => void;
  onReject: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
  activeCall: Call | null;
  isMinimized: boolean;
  onMinimize: () => void;
  onExpand: () => void;
}

export function IncomingCallModal({
  isRinging,
  isOnCall,
  from,
  contactName,
  contactId,
  onAnswer,
  onReject,
  onEndCall,
  onToggleMute,
  isMuted,
  activeCall,
  isMinimized,
  onMinimize,
  onExpand
}: IncomingCallModalProps) {
  const [duration, setDuration] = useState(0);
  const [digits, setDigits] = useState('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Play ringtone when ringing
  useEffect(() => {
    if (isRinging) {
      // Create audio element for ringtone
      audioRef.current = new Audio('/ringtone.mp3');
      audioRef.current.loop = true;
      audioRef.current.play().catch(() => {
        // Autoplay might be blocked, that's okay
      });
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [isRinging]);

  // Timer for call duration
  useEffect(() => {
    if (isOnCall) {
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setDuration(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isOnCall]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDialPress = (digit: string) => {
    setDigits(prev => prev + digit);
    if (activeCall) {
      activeCall.sendDigits(digit);
    }
  };

  const isOpen = isRinging || isOnCall;

  if (!isOpen) return null;

  // Render minimized widget when on call and minimized
  if (isOnCall && isMinimized) {
    return (
      <MinimizedCallWidget
        contactName={contactName}
        from={from}
        duration={duration}
        isMuted={isMuted}
        onToggleMute={onToggleMute}
        onEndCall={onEndCall}
        onExpand={onExpand}
      />
    );
  }

  return (
    <Dialog open={isOpen && !isMinimized} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md" 
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center py-6 space-y-6">
          {/* Minimize button when on call */}
          {isOnCall && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-10"
              onClick={onMinimize}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          )}

          {/* Avatar */}
          <div className={`relative ${isRinging ? 'animate-pulse' : ''}`}>
            <Avatar className="h-24 w-24">
              <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                {contactName ? contactName.charAt(0).toUpperCase() : <User className="h-10 w-10" />}
              </AvatarFallback>
            </Avatar>
            {isRinging && (
              <div className="absolute inset-0 rounded-full border-4 border-primary animate-ping" />
            )}
          </div>

          {/* Contact Info */}
          <div className="text-center space-y-1">
            <h3 className="text-xl font-semibold">
              {contactName || 'Número desconhecido'}
            </h3>
            <p className="text-muted-foreground">
              {formatPhoneDisplay(from)}
            </p>
          </div>

          {/* Status */}
          <div className="text-center">
            {isRinging ? (
              <p className="text-primary font-medium animate-pulse">
                Chamada recebida...
              </p>
            ) : (
              <p className="text-lg font-mono">
                {formatDuration(duration)}
              </p>
            )}
          </div>

          {/* DTMF Digits (when on call) */}
          {isOnCall && digits && (
            <p className="text-sm text-muted-foreground font-mono">
              {digits}
            </p>
          )}

          {/* Dial Pad (when on call) */}
          {isOnCall && (
            <div className="w-full max-w-[200px]">
              <DialPad onPress={handleDialPress} />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-4">
            {isRinging ? (
              <>
                <Button
                  variant="destructive"
                  size="lg"
                  className="h-14 w-14 rounded-full"
                  onClick={onReject}
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
                <Button
                  size="lg"
                  className="h-14 w-14 rounded-full bg-green-600 hover:bg-green-700"
                  onClick={onAnswer}
                >
                  <Phone className="h-6 w-6" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant={isMuted ? 'destructive' : 'secondary'}
                  size="lg"
                  className="h-14 w-14 rounded-full"
                  onClick={onToggleMute}
                >
                  {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  className="h-14 w-14 rounded-full"
                  onClick={onEndCall}
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

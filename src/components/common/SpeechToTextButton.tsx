import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SpeechToTextButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

export function SpeechToTextButton({ 
  onTranscript, 
  disabled,
  className 
}: SpeechToTextButtonProps) {
  const pendingTranscriptRef = useRef('');
  
  const { 
    isListening, 
    fullTranscript,
    interimTranscript,
    error,
    isSupported, 
    startListening, 
    stopListening,
    resetTranscript 
  } = useSpeechToText({
    language: 'pt-BR',
    continuous: true,
  });

  // Track transcript changes and send to input in real-time
  useEffect(() => {
    pendingTranscriptRef.current = fullTranscript;
    // Send transcript to input as it's being spoken
    if (fullTranscript.trim()) {
      onTranscript(fullTranscript.trim());
    }
  }, [fullTranscript, onTranscript]);

  if (!isSupported) {
    return null; // Hide button if not supported
  }

  const handleClick = () => {
    if (isListening) {
      stopListening();
      resetTranscript();
      pendingTranscriptRef.current = '';
    } else {
      startListening();
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isListening ? "destructive" : "outline"}
              size="icon"
              onClick={handleClick}
              disabled={disabled}
              className={cn(
                "transition-all shrink-0 h-[60px] w-[60px]",
                isListening && "animate-pulse",
                error && "border-destructive",
                className
              )}
            >
              {isListening ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isListening ? "Parar gravação" : error ? error : "Falar (Speech-to-Text)"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      {/* Error indicator */}
      {error && !isListening && (
        <span className="text-xs text-destructive max-w-[80px] text-center leading-tight">
          🔒 Sem permissão
        </span>
      )}
      
      {/* Interim transcript indicator */}
      {isListening && interimTranscript && (
        <span className="text-xs text-muted-foreground italic max-w-[60px] truncate">
          {interimTranscript}...
        </span>
      )}
    </div>
  );
}

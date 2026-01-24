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
    isSupported, 
    startListening, 
    stopListening,
    resetTranscript 
  } = useSpeechToText({
    language: 'pt-BR',
    continuous: true,
  });

  // Track transcript changes
  useEffect(() => {
    pendingTranscriptRef.current = fullTranscript;
  }, [fullTranscript]);

  if (!isSupported) {
    return null; // Hide button if not supported
  }

  const handleClick = () => {
    if (isListening) {
      stopListening();
      // Send transcript immediately when stopping
      if (pendingTranscriptRef.current.trim()) {
        onTranscript(pendingTranscriptRef.current.trim());
        resetTranscript();
        pendingTranscriptRef.current = '';
      }
    } else {
      startListening();
    }
  };

  return (
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
          <p>{isListening ? "Parar gravação" : "Falar (Speech-to-Text)"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

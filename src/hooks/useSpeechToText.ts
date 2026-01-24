import { useState, useRef, useCallback, useEffect } from 'react';

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface UseSpeechToTextOptions {
  language?: string;
  continuous?: boolean;
  onResult?: (transcript: string) => void;
  onEnd?: () => void;
}

export function useSpeechToText(options: UseSpeechToTextOptions = {}) {
  const { 
    language = 'pt-BR', 
    continuous = true,
    onResult,
    onEnd
  } = options;
  
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');
  const shouldRestartRef = useRef(false);

  useEffect(() => {
    // Check browser support
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || 
                                  (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setIsSupported(false);
      return;
    }
    
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = language;
    
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }
      
      if (final) {
        transcriptRef.current += final;
        setTranscript(transcriptRef.current);
        onResult?.(final);
      }
      setInterimTranscript(interim);
    };
    
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      
      // Ignore no-speech error - keep listening
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      
      setError(event.error);
      shouldRestartRef.current = false;
      setIsListening(false);
    };
    
    recognition.onend = () => {
      // Auto-restart if user hasn't stopped manually
      if (shouldRestartRef.current) {
        try {
          recognition.start();
        } catch (err) {
          console.error('Failed to restart speech recognition:', err);
          shouldRestartRef.current = false;
          setIsListening(false);
          onEnd?.();
        }
      } else {
        setIsListening(false);
        onEnd?.();
      }
    };
    
    recognitionRef.current = recognition;
    
    return () => {
      shouldRestartRef.current = false;
      recognition.abort();
    };
  }, [language, continuous, onResult, onEnd]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    transcriptRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    shouldRestartRef.current = true;
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setError('Não foi possível iniciar o reconhecimento de voz');
      shouldRestartRef.current = false;
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    shouldRestartRef.current = false;
    recognitionRef.current.stop();
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    transcriptRef.current = '';
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    fullTranscript: transcript + interimTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  };
}

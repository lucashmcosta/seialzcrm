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

const MAX_RESTARTS = 3;

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
  const restartCountRef = useRef(0);

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
      
      // Reset restart counter since we're getting results
      restartCountRef.current = 0;
      
      if (final) {
        transcriptRef.current += final;
        setTranscript(transcriptRef.current);
        onResult?.(final);
      }
      setInterimTranscript(interim);
    };
    
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      
      // Errors we should ignore and continue
      if (event.error === 'no-speech') {
        return; // Keep listening
      }
      
      // Fatal errors that should stop
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Permissão de microfone negada. Clique no cadeado 🔒 na barra de endereço.');
        shouldRestartRef.current = false;
        setIsListening(false);
        return;
      }
      
      if (event.error === 'audio-capture') {
        setError('Microfone não encontrado ou em uso por outro app.');
        shouldRestartRef.current = false;
        setIsListening(false);
        return;
      }
      
      // Aborted is ok, will restart via onend
      if (event.error === 'aborted') {
        return;
      }
      
      // Other errors
      setError(event.error);
      shouldRestartRef.current = false;
      setIsListening(false);
    };
    
    recognition.onend = () => {
      // Auto-restart if user hasn't stopped manually AND under restart limit
      if (shouldRestartRef.current && restartCountRef.current < MAX_RESTARTS) {
        restartCountRef.current++;
        try {
          recognition.start();
        } catch (err) {
          console.error('Failed to restart speech recognition:', err);
          shouldRestartRef.current = false;
          setIsListening(false);
          restartCountRef.current = 0;
          onEnd?.();
        }
      } else {
        // Hit limit or manually stopped
        if (restartCountRef.current >= MAX_RESTARTS && shouldRestartRef.current) {
          setError('Microfone não está captando áudio. Verifique as permissões.');
        }
        shouldRestartRef.current = false;
        setIsListening(false);
        restartCountRef.current = 0;
        onEnd?.();
      }
    };
    
    recognitionRef.current = recognition;
    
    return () => {
      shouldRestartRef.current = false;
      recognition.abort();
    };
  }, [language, continuous, onResult, onEnd]);

  const startListening = useCallback(async () => {
    if (!recognitionRef.current) return;
    
    // Request microphone permission explicitly first
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream immediately - we just needed to request permission
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      console.error('Microphone permission denied:', err);
      setError('Permissão de microfone negada. Clique no cadeado 🔒 na barra de endereço.');
      return;
    }
    
    // Reset states
    setError(null);
    transcriptRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    shouldRestartRef.current = true;
    restartCountRef.current = 0;
    
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
    restartCountRef.current = 0;
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

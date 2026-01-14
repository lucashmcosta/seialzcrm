import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Mic, Square, Send, Trash2, Loader2 } from 'lucide-react';
import OpusMediaRecorder from 'opus-media-recorder';

// Worker options for opus-media-recorder
const workerOptions = {
  encoderWorkerFactory: () => new Worker(
    new URL('opus-media-recorder/encoderWorker.umd.js', import.meta.url),
    { type: 'module' }
  ),
  OggOpusEncoderWasmPath: 'https://cdn.jsdelivr.net/npm/opus-media-recorder@latest/OggOpusEncoder.wasm',
};

interface AudioRecorderProps {
  onSend: (audioBlob: Blob) => Promise<void>;
  disabled?: boolean;
}

export function AudioRecorder({ onSend, disabled }: AudioRecorderProps) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isSending, setIsSending] = useState(false);

  const mediaRecorderRef = useRef<any>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000, // Opus works best with 48kHz
        }
      });
      streamRef.current = stream;

      // Use OpusMediaRecorder to record directly in OGG Opus format (WhatsApp compatible)
      const mimeType = 'audio/ogg;codecs=opus';
      
      let mediaRecorder: any;
      
      try {
        // Try to use OpusMediaRecorder (polyfill for OGG Opus)
        mediaRecorder = new OpusMediaRecorder(stream, { mimeType }, workerOptions);
      } catch (polyfillError) {
        console.warn('OpusMediaRecorder failed, trying native:', polyfillError);
        // Fallback to native MediaRecorder
        const nativeMimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
        mediaRecorder = new MediaRecorder(stream, { mimeType: nativeMimeType });
      }
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Create blob with OGG Opus type
        const blob = new Blob(chunksRef.current, { type: 'audio/ogg;codecs=opus' });
        setAudioBlob(blob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error: any) {
      console.error('Error starting recording:', error);
      toast({
        variant: 'destructive',
        description: 'Não foi possível acessar o microfone. Verifique as permissões.',
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    setIsRecording(false);
    setRecordingTime(0);
    setAudioBlob(null);
    chunksRef.current = [];
  };

  const handleSend = async () => {
    if (!audioBlob) return;

    setIsSending(true);
    try {
      await onSend(audioBlob);
      setAudioBlob(null);
      setRecordingTime(0);
    } catch (error) {
      console.error('Error sending audio:', error);
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // If we have a recorded audio, show send/delete options
  if (audioBlob) {
    return (
      <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-sm font-medium">{formatTime(recordingTime)}</span>
          <div className="flex-1 h-1 bg-green-200 dark:bg-green-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500" 
              style={{ width: '100%' }}
            />
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={cancelRecording}
          disabled={isSending}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          onClick={handleSend}
          disabled={isSending}
          className="bg-green-600 hover:bg-green-700"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
    );
  }

  // If recording, show stop button and timer
  if (isRecording) {
    return (
      <div className="flex items-center gap-2 bg-destructive/10 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-sm font-medium text-destructive">{formatTime(recordingTime)}</span>
          <span className="text-xs text-muted-foreground">Gravando...</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={cancelRecording}
          className="text-muted-foreground"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          onClick={stopRecording}
          variant="destructive"
        >
          <Square className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  // Default: show mic button
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={startRecording}
      disabled={disabled}
      title="Gravar áudio"
    >
      <Mic className="w-4 h-4" />
    </Button>
  );
}

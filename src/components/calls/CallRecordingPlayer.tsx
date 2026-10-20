import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, DownloadSimple, SpeakerHigh, WarningCircle } from '@phosphor-icons/react';
import { reportAudioFailure, isValidHttpUrl } from '@/lib/audioErrorReport';
import { getProxiedMediaUrlAsync } from '@/lib/mediaProxy';
import { supabase } from '@/integrations/supabase/client';

interface CallRecordingPlayerProps {
  recordingUrl: string;
  duration?: number;
  /** Caminho no bucket `call-recordings`. Quando existe, é daqui que o áudio toca. */
  storagePath?: string | null;
  organizationId?: string;
}

export function CallRecordingPlayer({ recordingUrl, duration, storagePath, organizationId }: CallRecordingPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // De onde o áudio toca, em ordem:
  //   1. nosso bucket, por URL assinada -- é onde o áudio vive desde que o
  //      arquivamento passou a trazê-lo do Twilio (e a apagá-lo de lá);
  //   2. gravações antigas, que seguem no Twilio: pelo twilio-media-proxy,
  //      porque api.twilio.com pede Basic Auth e o navegador abre uma caixa
  //      de login no meio da tela.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (storagePath) {
        const { data } = await supabase.storage
          .from('call-recordings')
          .createSignedUrl(storagePath, 3600);
        if (cancelado) return;
        if (data?.signedUrl) {
          setPlayUrl(data.signedUrl);
          return;
        }
      }
      const url = await getProxiedMediaUrlAsync(recordingUrl, organizationId);
      if (!cancelado) setPlayUrl(url);
    })();
    return () => {
      cancelado = true;
    };
  }, [storagePath, recordingUrl, organizationId]);

  // Trocar a fonte invalida o elemento de áudio que já existia.
  useEffect(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setIsPlaying(false);
    setCurrentTime(0);
    setHasError(false);
  }, [playUrl]);

  const srcOk = !!playUrl && isValidHttpUrl(playUrl);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const togglePlay = async () => {
    if (!srcOk || hasError) return;
    if (!audioRef.current) {
      const a = new Audio(playUrl!);
      a.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };
      a.ontimeupdate = () => {
        setCurrentTime(a.currentTime || 0);
      };
      a.onerror = () => {
        setIsPlaying(false);
        setHasError(true);
        reportAudioFailure({
          component: 'CallRecordingPlayer',
          src: playUrl ?? recordingUrl,
          audio: a,
          error: a.error ? { name: 'MediaError', message: `code=${a.error.code}` } : undefined,
        });
      };
      audioRef.current = a;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    try {
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (err) {
      setIsPlaying(false);
      setHasError(true);
      reportAudioFailure({
        component: 'CallRecordingPlayer',
        src: playUrl ?? recordingUrl,
        audio: audioRef.current,
        error: err,
      });
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!playUrl) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-xs text-muted-foreground">
        <SpeakerHigh className="h-4 w-4 animate-pulse" />
        Carregando áudio...
      </div>
    );
  }

  if (!srcOk) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-xs text-muted-foreground">
        <WarningCircle className="h-4 w-4" />
        Não foi possível carregar este áudio.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={togglePlay}
        disabled={hasError}
        title={hasError ? 'Não foi possível carregar este áudio.' : undefined}
      >
        {hasError ? (
          <WarningCircle className="h-4 w-4 text-muted-foreground" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      <SpeakerHigh className="h-4 w-4 text-muted-foreground" />

      <div className="flex-1 min-w-0">
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {duration && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </span>
      )}

      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
        <a href={playUrl ?? recordingUrl} download target="_blank" rel="noopener noreferrer">
          <DownloadSimple className="h-4 w-4" />
        </a>
      </Button>
    </div>
  );
}

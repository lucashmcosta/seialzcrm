import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, DownloadSimple, SpeakerHigh, WarningCircle } from '@phosphor-icons/react';
import { reportAudioFailure, isValidHttpUrl } from '@/lib/audioErrorReport';

interface CallRecordingPlayerProps {
  recordingUrl: string;
  duration?: number;
}

export function CallRecordingPlayer({ recordingUrl, duration }: CallRecordingPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasError, setHasError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const srcOk = isValidHttpUrl(recordingUrl);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const togglePlay = async () => {
    if (!srcOk || hasError) return;
    if (!audioRef.current) {
      const a = new Audio(recordingUrl);
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
          src: recordingUrl,
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
        src: recordingUrl,
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
        <a href={recordingUrl} download target="_blank" rel="noopener noreferrer">
          <DownloadSimple className="h-4 w-4" />
        </a>
      </Button>
    </div>
  );
}

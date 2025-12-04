import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Download, Volume2 } from 'lucide-react';

interface CallRecordingPlayerProps {
  recordingUrl: string;
  duration?: number;
}

export function CallRecordingPlayer({ recordingUrl, duration }: CallRecordingPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(recordingUrl);
      audioRef.current.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };
      audioRef.current.ontimeupdate = () => {
        setCurrentTime(audioRef.current?.currentTime || 0);
      };
    }

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={togglePlay}>
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      
      <Volume2 className="h-4 w-4 text-muted-foreground" />
      
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
          <Download className="h-4 w-4" />
        </a>
      </Button>
    </div>
  );
}

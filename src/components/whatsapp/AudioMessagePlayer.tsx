import { useState, useRef, useEffect, useCallback } from 'react';

interface AudioMessagePlayerProps {
  src: string;
  className?: string;
}

export function AudioMessagePlayer({ src, className = '' }: AudioMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const animFrameRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [waveformData] = useState(() =>
    Array.from({ length: 45 }, () => Math.random() * 0.5 + 0.2)
  );

  const progress = duration > 0 ? currentTime / duration : 0;

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      cancelAnimationFrame(animFrameRef.current);
    };
    const onError = () => {
      setIsLoading(false);
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [src]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || isLoading) return;

    if (isPlaying) {
      audio.pause();
      cancelAnimationFrame(animFrameRef.current);
    } else {
      audio.play();
      const tick = () => {
        setCurrentTime(audio.currentTime);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, isLoading]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    audio.currentTime = pct * duration;
    setCurrentTime(audio.currentTime);
  };

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px', maxWidth: 240, minWidth: 200 }}>
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause */}
      <button
        onClick={togglePlay}
        disabled={isLoading}
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          border: 'none',
          background: 'transparent',
          cursor: isLoading ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          flexShrink: 0,
          opacity: isLoading ? 0.4 : 1,
        }}
      >
        {isPlaying ? (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <rect x="5" y="3" width="3.5" height="14" rx="1" fill="rgba(255,255,255,0.9)" />
            <rect x="11.5" y="3" width="3.5" height="14" rx="1" fill="rgba(255,255,255,0.9)" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M5 3.5V16.5C5 17.1 5.6 17.4 6.1 17.1L17 10.5C17.5 10.2 17.5 9.5 17 9.2L6.1 2.9C5.6 2.6 5 2.9 5 3.5Z" fill="rgba(255,255,255,0.9)" />
          </svg>
        )}
      </button>

      {/* Waveform + time */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          onClick={handleSeek}
          onTouchStart={handleSeek}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            height: 20,
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          {waveformData.map((h, i) => {
            const barProgress = i / waveformData.length;
            const isActive = barProgress <= progress;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${h * 100}%`,
                  minWidth: 2,
                  borderRadius: 1,
                  background: isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
                  transition: 'background 0.1s',
                }}
              />
            );
          })}
          {/* Seek dot */}
          <div
            style={{
              position: 'absolute',
              left: `${progress * 100}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#FFFFFF',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              transition: 'left 0.05s linear',
              pointerEvents: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 2 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>
            {isPlaying || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

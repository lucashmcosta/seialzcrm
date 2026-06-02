import { useState, useRef, useEffect, useCallback, ReactNode } from 'react';

interface AudioMessagePlayerProps {
  src: string;
  className?: string;
  timestamp?: string;
  statusIcon?: ReactNode;
}

export function AudioMessagePlayer({ src, className = '', timestamp, statusIcon }: AudioMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const animFrameRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [waveformData] = useState(() =>
    Array.from({ length: 32 }, () => Math.random() * 0.5 + 0.2)
  );


  const cycleRate = () => {
    const next = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

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
      setHasError(true);
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

  const hasStarted = isPlaying || currentTime > 0;

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: 2, width: 260 }}>

      <audio ref={audioRef} src={src} preload="metadata" />
      {hasError && (
        <div style={{ fontSize: 11, opacity: 0.7, padding: '4px 6px' }}>
          Não foi possível carregar este áudio.
        </div>
      )}

      {/* Row 1: Play + Waveform */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 24 }}>
        <button
          onClick={togglePlay}
          disabled={isLoading}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            color: 'currentColor',
            cursor: isLoading ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            margin: 0,
            flexShrink: 0,
            opacity: isLoading ? 0.4 : 1,
          }}
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <rect x="5" y="3" width="3.5" height="14" rx="1" fill="currentColor" />
              <rect x="11.5" y="3" width="3.5" height="14" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M5 3.5V16.5C5 17.1 5.6 17.4 6.1 17.1L17 10.5C17.5 10.2 17.5 9.5 17 9.2L6.1 2.9C5.6 2.6 5 2.9 5 3.5Z" fill="currentColor" />
            </svg>
          )}
        </button>

        <div
          onClick={handleSeek}
          onTouchStart={handleSeek}
          style={{
            flex: 1,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
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
                  background: isActive ? 'currentColor' : 'currentColor',
                  opacity: isActive ? 0.85 : 0.3,
                  transition: 'background 0.1s',
                }}
              />
            );
          })}
          <div
            style={{
              position: 'absolute',
              left: `${progress * 100}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'currentColor',
              boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              transition: 'left 0.05s linear',
              pointerEvents: 'none',
            }}
          />
        </div>

        {!isLoading && hasStarted && (
          <button
            onClick={cycleRate}
            style={{
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1,
              padding: '2px 5px',
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              background: playbackRate === 1
                ? 'transparent'
                : 'color-mix(in srgb, currentColor 15%, transparent)',
              color: 'currentColor',
              opacity: playbackRate === 1 ? 0.75 : 1,
              flexShrink: 0,
              minWidth: 28,
              fontVariantNumeric: 'tabular-nums',
            }}
            aria-label={`Velocidade ${playbackRate}x`}
          >
            {playbackRate === 1 ? '1x' : playbackRate === 1.5 ? '1.5x' : '2x'}
          </button>
        )}

      </div>

      {/* Row 2: Duration + Timestamp */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 0, marginLeft: 34, marginTop: 0, marginBottom: 0, marginRight: 0 }}>
        <span style={{ fontSize: 11, lineHeight: '14px', color: 'currentColor', opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
          {isPlaying || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}
        </span>
        {timestamp && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, lineHeight: '14px', color: 'currentColor', opacity: 0.7 }}>
            {timestamp}
            {statusIcon}
          </span>
        )}
      </div>
    </div>
  );
}

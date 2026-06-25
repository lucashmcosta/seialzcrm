import { useState, useRef, useCallback } from 'react';

const RETRY_DELAYS = [2000, 5000, 10000];

function useRetry() {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<number | null>(null);

  const scheduleRetry = useCallback((onRetry: () => void) => {
    setAttempt((prev) => {
      if (prev >= RETRY_DELAYS.length) {
        setFailed(true);
        setLoading(false);
        return prev;
      }
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        onRetry();
      }, RETRY_DELAYS[prev]);
      return prev + 1;
    });
  }, []);

  const manualRetry = useCallback((onRetry: () => void) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setAttempt(0);
    setFailed(false);
    setLoading(true);
    onRetry();
  }, []);

  return { attempt, failed, loading, setLoading, scheduleRetry, manualRetry };
}

export function RetryableImage({ src, className, onClick, alt }: { src: string; className?: string; onClick?: () => void; alt?: string }) {
  const { attempt, failed, scheduleRetry, manualRetry } = useRetry();
  const [cacheBust, setCacheBust] = useState(0);

  const finalSrc = cacheBust > 0 ? `${src}${src.includes('?') ? '&' : '?'}_r=${cacheBust}` : src;

  if (failed) {
    return (
      <div className={`flex flex-col gap-1 p-2 rounded bg-muted/40 text-xs ${className ?? ''}`}>
        <span className="opacity-70">Não foi possível carregar esta imagem.</span>
        <div className="flex gap-2">
          <button
            onClick={() => { setCacheBust((n) => n + 1); manualRetry(() => {}); }}
            className="underline opacity-80 hover:opacity-100"
          >
            Tentar novamente
          </button>
          <a href={src} target="_blank" rel="noopener noreferrer" className="underline opacity-80 hover:opacity-100">
            Abrir
          </a>
        </div>
      </div>
    );
  }

  return (
    <img
      src={finalSrc}
      alt={alt ?? 'Media'}
      className={className}
      onClick={onClick}
      onError={() => {
        scheduleRetry(() => setCacheBust((n) => n + 1));
      }}
    />
  );
}

export function RetryableVideo({ src, className }: { src: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { failed, scheduleRetry, manualRetry } = useRetry();
  const [key, setKey] = useState(0);

  if (failed) {
    return (
      <div className={`flex flex-col gap-1 p-2 rounded bg-muted/40 text-xs ${className ?? ''}`}>
        <span className="opacity-70">Não foi possível carregar este vídeo.</span>
        <div className="flex gap-2">
          <button
            onClick={() => { setKey((n) => n + 1); manualRetry(() => {}); }}
            className="underline opacity-80 hover:opacity-100"
          >
            Tentar novamente
          </button>
          <a href={src} target="_blank" rel="noopener noreferrer" className="underline opacity-80 hover:opacity-100">
            Baixar vídeo
          </a>
        </div>
      </div>
    );
  }

  return (
    <video
      key={key}
      ref={videoRef}
      src={src}
      controls
      className={className}
      preload="metadata"
      onError={() => {
        scheduleRetry(() => {
          setKey((n) => n + 1);
        });
      }}
    />
  );
}

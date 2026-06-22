// Handled-warning reporter for HTMLAudioElement playback failures.
// Avoids letting `audio.play()` Promise rejections bubble as unhandledrejection.

export interface AudioFailureContext {
  component: 'AudioMessagePlayer' | 'CallRecordingPlayer';
  src: string | null | undefined;
  audio?: HTMLAudioElement | null;
  error?: unknown;
  messageId?: string;
  threadId?: string;
  mediaType?: string | null;
}

function safeHost(src: string | null | undefined): string | null {
  if (!src) return null;
  try {
    return new URL(src).host;
  } catch {
    return 'invalid-url';
  }
}

function isProxied(src: string | null | undefined): boolean {
  if (!src) return false;
  try {
    const u = new URL(src);
    return u.host.endsWith('.supabase.co') && u.pathname.includes('twilio-media-proxy');
  } catch {
    return false;
  }
}

function canPlay(audio: HTMLAudioElement | null | undefined, type: string): string {
  if (!audio || typeof audio.canPlayType !== 'function') return 'n/a';
  try {
    return audio.canPlayType(type) || 'no';
  } catch {
    return 'err';
  }
}

export function reportAudioFailure(ctx: AudioFailureContext): void {
  const err = ctx.error as any;
  const audio = ctx.audio ?? null;
  const extra: Record<string, unknown> = {
    component: ctx.component,
    message_id: ctx.messageId ?? null,
    thread_id: ctx.threadId ?? null,
    media_type: ctx.mediaType ?? null,
    src_present: !!ctx.src,
    src_host: safeHost(ctx.src),
    proxied: isProxied(ctx.src),
    audio_error_code: audio?.error?.code ?? null,
    audio_network_state: audio?.networkState ?? null,
    audio_ready_state: audio?.readyState ?? null,
    can_play_audio_ogg_opus: canPlay(audio, 'audio/ogg; codecs="opus"'),
    can_play_audio_ogg: canPlay(audio, 'audio/ogg'),
    can_play_audio_mpeg: canPlay(audio, 'audio/mpeg'),
    can_play_audio_mp4: canPlay(audio, 'audio/mp4'),
    can_play_audio_wav: canPlay(audio, 'audio/wav'),
    error_name: err?.name ?? null,
    error_message: err?.message ?? null,
  };

  import('@sentry/react')
    .then((Sentry) => {
      try {
        Sentry.captureMessage('Audio playback failed', {
          level: 'warning',
          extra,
        });
      } catch {
        console.warn('[audio] playback failed (sentry capture failed)', extra);
      }
    })
    .catch(() => {
      console.warn('[audio] playback failed', extra);
    });
}

export function isValidHttpUrl(src: string | null | undefined): boolean {
  if (!src) return false;
  try {
    const u = new URL(src);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

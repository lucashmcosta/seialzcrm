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
  phase?: 'load' | 'play';
}

const reportedAudioFailures = new Set<string>();

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

function extensionFromSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  try {
    const pathname = new URL(src).pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]+)$/);
    return match?.[1] ?? null;
  } catch {
    const match = src.toLowerCase().split('?')[0]?.match(/\.([a-z0-9]+)$/);
    return match?.[1] ?? null;
  }
}

function reportKey(ctx: AudioFailureContext): string {
  const audio = ctx.audio ?? null;
  const err = ctx.error as any;
  return [
    ctx.component,
    ctx.messageId ?? 'no-message',
    ctx.threadId ?? 'no-thread',
    extensionFromSrc(ctx.src) ?? 'no-ext',
    audio?.error?.code ?? err?.name ?? 'unknown',
    ctx.phase ?? 'unknown',
  ].join(':');
}

export function reportAudioFailure(ctx: AudioFailureContext): void {
  const key = reportKey(ctx);
  if (reportedAudioFailures.has(key)) return;
  reportedAudioFailures.add(key);

  const err = ctx.error as any;
  const audio = ctx.audio ?? null;
  const extra: Record<string, unknown> = {
    component: ctx.component,
    phase: ctx.phase ?? null,
    message_id: ctx.messageId ?? null,
    thread_id: ctx.threadId ?? null,
    media_type: ctx.mediaType ?? null,
    src_present: !!ctx.src,
    src_host: safeHost(ctx.src),
    src_extension: extensionFromSrc(ctx.src),
    proxied: isProxied(ctx.src),
    audio_error_code: audio?.error?.code ?? null,
    audio_network_state: audio?.networkState ?? null,
    audio_ready_state: audio?.readyState ?? null,
    can_play_audio_ogg_opus: canPlay(audio, 'audio/ogg; codecs="opus"'),
    can_play_audio_ogg: canPlay(audio, 'audio/ogg'),
    can_play_audio_mpeg: canPlay(audio, 'audio/mpeg'),
    can_play_audio_mp4: canPlay(audio, 'audio/mp4'),
    can_play_audio_webm_opus: canPlay(audio, 'audio/webm; codecs="opus"'),
    can_play_audio_webm: canPlay(audio, 'audio/webm'),
    can_play_audio_aac: canPlay(audio, 'audio/aac'),
    can_play_audio_amr: canPlay(audio, 'audio/amr'),
    can_play_audio_wav: canPlay(audio, 'audio/wav'),
    error_name: err?.name ?? null,
    error_message: err?.message ?? null,
  };

  // Do not emit this as a Sentry issue — it's expected noise (expired Twilio
  // media URLs, Evolution media still downloading, Safari codec mismatch,
  // flaky networks). Keep it as a breadcrumb so if a real error happens later
  // in the same session, the audio context still shows up in that event.
  console.warn('[audio] playback failed', extra);

  import('@sentry/react')
    .then((Sentry) => {
      try {
        Sentry.addBreadcrumb({
          category: 'audio',
          level: 'warning',
          message: 'Audio playback failed',
          data: extra,
        });
      } catch {
        // ignore
      }
    })
    .catch(() => {
      // ignore
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

export function isLikelyAudioUrl(src: string | null | undefined): boolean {
  if (!src) return false;
  try {
    const pathname = new URL(src).pathname.toLowerCase();
    return /\.(ogg|oga|opus|mp3|mpeg|wav|m4a|aac|amr|webm)$/.test(pathname);
  } catch {
    return /\.(ogg|oga|opus|mp3|mpeg|wav|m4a|aac|amr|webm)(\?|$)/i.test(src);
  }
}

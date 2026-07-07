// Fire-and-forget telemetry for AudioRecorder. Never throws, never blocks.
import { supabase } from '@/integrations/supabase/client';

export type AudioTelemetryEvent =
  | 'audio_record_success'
  | 'audio_record_invalid_ogg'
  | 'audio_record_fallback_mp4'
  | 'audio_record_fallback_webm_document'
  | 'audio_record_polyfill_init_error';

export interface AudioTelemetryContext {
  endpointId?: string | null;
  threadId?: string | null;
  organizationId?: string | null;
}

export interface AudioTelemetryPayload extends AudioTelemetryContext {
  mimeType?: string | null;
  durationMs?: number | null;
  sizeBytes?: number | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
}

function detectBrowser(ua: string): string {
  const s = ua.toLowerCase();
  if (s.includes('edg/')) return 'edge';
  if (s.includes('opr/') || s.includes('opera')) return 'opera';
  if (s.includes('chrome/') && !s.includes('chromium')) return 'chrome';
  if (s.includes('firefox/')) return 'firefox';
  if (s.includes('safari/') && !s.includes('chrome')) return 'safari';
  if (s.includes('samsungbrowser')) return 'samsung';
  return 'other';
}

export function logAudioEvent(event: AudioTelemetryEvent, payload: AudioTelemetryPayload = {}): void {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const row = {
      event,
      browser: detectBrowser(ua),
      user_agent: ua.slice(0, 500),
      mime_type: payload.mimeType ?? null,
      duration_ms: payload.durationMs ?? null,
      size_bytes: payload.sizeBytes ?? null,
      endpoint_id: payload.endpointId ?? null,
      thread_id: payload.threadId ?? null,
      organization_id: payload.organizationId ?? null,
      error: payload.error ?? null,
      metadata: (payload.metadata ?? null) as never,
    };
    // Fire-and-forget: no await, swallow errors.
    void supabase.from('audio_record_events').insert(row).then(({ error }) => {
      if (error) console.warn('[audioTelemetry] insert failed', error.message);
    }, (err) => {
      console.warn('[audioTelemetry] insert threw', err);
    });
  } catch (err) {
    console.warn('[audioTelemetry] logAudioEvent threw', err);
  }
}

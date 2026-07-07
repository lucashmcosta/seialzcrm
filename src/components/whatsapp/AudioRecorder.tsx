import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Microphone, Square, PaperPlaneTilt, TrashSimple, SpinnerGap } from '@phosphor-icons/react';
import OpusMediaRecorder from 'opus-media-recorder';
// Serve worker + WASM from the local bundle — NO CDN.
// encoderWorker.umd.js is a CLASSIC UMD worker; instantiate WITHOUT `{ type: 'module' }`.
import workerUrl from 'opus-media-recorder/encoderWorker.umd.js?url';
import oggWasmUrl from 'opus-media-recorder/OggOpusEncoder.wasm?url';
import webmWasmUrl from 'opus-media-recorder/WebMOpusEncoder.wasm?url';
import { logAudioEvent, type AudioTelemetryContext } from '@/lib/audioTelemetry';

const workerOptions = {
  encoderWorkerFactory: () => new Worker(workerUrl),
  OggOpusEncoderWasmPath: oggWasmUrl,
  WebMOpusEncoderWasmPath: webmWasmUrl,
};

// Warm worker + WASM on mount so first click is fast and deterministic.
let warmupPromise: Promise<void> | null = null;
function warmupOpusPolyfill(): Promise<void> {
  if (warmupPromise) return warmupPromise;
  warmupPromise = (async () => {
    try {
      await Promise.all([
        fetch(workerUrl, { cache: 'force-cache' }).then((r) => r.ok),
        fetch(oggWasmUrl, { cache: 'force-cache' }).then((r) => r.ok),
      ]);
    } catch (err) {
      console.warn('[AudioRecorder] polyfill warmup fetch failed (will retry on record)', err);
      warmupPromise = null;
    }
  })();
  return warmupPromise;
}

// Minimum recording duration (ms) before the stop button is enabled.
// Guarantees the encoder has time to emit BOS + OpusHead + at least one data page.
const MIN_RECORD_MS = 1000;

// Validate the recorded blob before allowing send.
// Meta requires a real OGG Opus stream (OggS + OpusHead identification header).
async function validateOggOpus(blob: Blob): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!blob || blob.size < 2048) return { ok: false, reason: 'muito curto' };
  // OpusHead should be in the first Ogg page — scan a generous 4KB window.
  const head = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
  const hasOggS = head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53;
  if (!hasOggS) return { ok: false, reason: 'sem cabeçalho OggS' };
  const needle = [0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64]; // "OpusHead"
  outer: for (let i = 0; i <= head.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (head[i + j] !== needle[j]) continue outer;
    return { ok: true };
  }
  return { ok: false, reason: 'sem OpusHead' };
}

type RecorderKind = 'opus-ogg' | 'native-ogg' | 'native-mp4' | 'native-webm';

function pickNativeMime(): { mime: string; kind: RecorderKind } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) return { mime: 'audio/ogg;codecs=opus', kind: 'native-ogg' };
  if (MediaRecorder.isTypeSupported('audio/mp4')) return { mime: 'audio/mp4', kind: 'native-mp4' };
  if (MediaRecorder.isTypeSupported('audio/mp4;codecs=mp4a.40.2')) return { mime: 'audio/mp4;codecs=mp4a.40.2', kind: 'native-mp4' };
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return { mime: 'audio/webm;codecs=opus', kind: 'native-webm' };
  return null;
}

interface AudioRecorderProps extends AudioTelemetryContext {
  onSend: (audioBlob: Blob) => Promise<void>;
  /** Optional escape hatch when the browser can only produce WebM. When provided,
   *  we offer to upload as a document instead of failing. */
  onSendAsDocument?: (audioBlob: Blob) => Promise<void>;
  disabled?: boolean;
}

export function AudioRecorder({ onSend, onSendAsDocument, disabled, endpointId, threadId, organizationId }: AudioRecorderProps) {
  const telemetryCtx: AudioTelemetryContext = { endpointId, threadId, organizationId };
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordedKind, setRecordedKind] = useState<RecorderKind | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [needsDocumentConfirm, setNeedsDocumentConfirm] = useState(false);

  const mediaRecorderRef = useRef<any>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderKindRef = useRef<RecorderKind | null>(null);

  // Step 1 — Warmup polyfill (worker + WASM) on mount so first click is fast and deterministic.
  useEffect(() => {
    void warmupOpusPolyfill();
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = async () => {
    try {
      // Best-effort warmup before touching the mic (usually already cached from mount).
      await warmupOpusPolyfill();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
      });
      streamRef.current = stream;

      let mediaRecorder: any = null;
      let kind: RecorderKind | null = null;

      // Preferred path: opus-media-recorder polyfill → real OGG/Opus.
      try {
        mediaRecorder = new OpusMediaRecorder(stream, { mimeType: 'audio/ogg;codecs=opus' }, workerOptions);
        kind = 'opus-ogg';
      } catch (polyfillError) {
        console.warn('[AudioRecorder] OpusMediaRecorder failed, trying native', polyfillError);
        logAudioEvent('audio_record_polyfill_init_error', {
          ...telemetryCtx,
          error: (polyfillError as Error)?.message ?? String(polyfillError),
        });
        const native = pickNativeMime();
        if (native) {
          mediaRecorder = new MediaRecorder(stream, { mimeType: native.mime });
          kind = native.kind;
          if (kind === 'native-mp4') {
            logAudioEvent('audio_record_fallback_mp4', { ...telemetryCtx, mimeType: native.mime });
          }
        }
      }

      if (!mediaRecorder || !kind) {
        stream.getTracks().forEach((t) => t.stop());
        toast({
          variant: 'destructive',
          description: 'Seu navegador não suporta gravação de áudio. Envie um arquivo pelo anexo.',
        });
        return;
      }

      recorderKindRef.current = kind;
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const actualType: string =
          (mediaRecorder && typeof mediaRecorder.mimeType === 'string' && mediaRecorder.mimeType) ||
          (chunksRef.current[0] && (chunksRef.current[0] as Blob).type) ||
          'audio/ogg;codecs=opus';
        const blob = new Blob(chunksRef.current, { type: actualType });
        setAudioBlob(blob);
        setRecordedKind(recorderKindRef.current);
        stream.getTracks().forEach((t) => t.stop());
      };

      // Start WITHOUT timeslice — we want a single blob on stop() containing the
      // full OGG stream (BOS + OpusHead + data pages). Passing a timeslice caused
      // premature ondataavailable emissions that lacked identification headers.
      mediaRecorder.start();
      startedAtRef.current = Date.now();
      setIsRecording(true);
      setRecordingTime(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingTime(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
    } catch (error: any) {
      console.error('Error starting recording:', error);
      toast({
        variant: 'destructive',
        description: 'Não foi possível acessar o microfone. Verifique as permissões.',
      });
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    // Guard: never let the user stop before the encoder had time to emit BOS/OpusHead.
    if (Date.now() - startedAtRef.current < MIN_RECORD_MS) return;
    mediaRecorderRef.current.stop();
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const resetRecording = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
    setRecordingTime(0);
    setAudioBlob(null);
    setRecordedKind(null);
    setNeedsDocumentConfirm(false);
    chunksRef.current = [];
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      try { mediaRecorderRef.current.stop(); } catch { /* noop */ }
    }
    resetRecording();
  };

  const handleSend = async () => {
    if (!audioBlob) return;

    // Duration guard.
    if (recordingTime < 2) {
      toast({
        variant: 'destructive',
        description: 'Falha ao gerar áudio. Tente gravar novamente com pelo menos 2 segundos.',
      });
      return;
    }

    const type = (audioBlob.type || '').toLowerCase();
    const kind = recordedKind;

    // Step 3a — OGG path: validate container. Meta requires OggS + OpusHead.
    if (kind === 'opus-ogg' || kind === 'native-ogg' || type.includes('ogg')) {
      const check = await validateOggOpus(audioBlob);
      if (!check.ok) {
        console.error('[AudioRecorder] invalid OGG Opus blob', {
          size: audioBlob.size, type, reason: (check as { reason: string }).reason,
        });
        logAudioEvent('audio_record_invalid_ogg', {
          ...telemetryCtx,
          mimeType: type,
          durationMs: recordingTime * 1000,
          sizeBytes: audioBlob.size,
          error: (check as { reason: string }).reason,
        });
        toast({
          variant: 'destructive',
          description: 'Falha ao gerar áudio. Tente gravar novamente com pelo menos 2 segundos.',
        });
        resetRecording();
        return;
      }
      await doSendAudio();
      return;
    }

    // MP4: Meta accepts audio/mp4 only when it's AAC. Browsers frequently emit
    // MP4/Opus (Safari, Chrome-Android) which Meta rejects async with 131053.
    // Do NOT send MP4 as audio — offer document fallback instead.
    // WebM: Meta rejects as audio (code 100). Same fallback.
    const isMp4  = kind === 'native-mp4'  || type.includes('mp4') || type.includes('m4a') || type.includes('aac');
    const isWebm = kind === 'native-webm' || type.includes('webm');
    if (isMp4 || isWebm) {
      console.warn('[AudioRecorder] non-ogg container; offering document fallback', {
        size: audioBlob.size, type, kind,
      });
      logAudioEvent(isMp4 ? 'audio_record_fallback_mp4' : 'audio_record_invalid_ogg', {
        ...telemetryCtx,
        mimeType: type || null,
        durationMs: recordingTime * 1000,
        sizeBytes: audioBlob.size,
        error: isMp4 ? 'mp4_not_sent_as_audio' : 'webm_not_sent_as_audio',
      });
      if (onSendAsDocument) {
        setNeedsDocumentConfirm(true);
        return;
      }
      toast({
        variant: 'destructive',
        description: 'Seu navegador gerou um áudio em formato não compatível com WhatsApp. Envie um arquivo de áudio pelo anexo.',
      });
      resetRecording();
      return;
    }

    // Unknown container.
    console.error('[AudioRecorder] unsupported audio mime', { size: audioBlob.size, type });
    toast({ variant: 'destructive', description: 'Formato de áudio não suportado. Grave novamente.' });
    resetRecording();
  };


  const doSendAudio = async () => {
    if (!audioBlob) return;
    setIsSending(true);
    try {
      await onSend(audioBlob);
      logAudioEvent('audio_record_success', {
        ...telemetryCtx,
        mimeType: audioBlob.type || null,
        durationMs: recordingTime * 1000,
        sizeBytes: audioBlob.size,
      });
      resetRecording();
    } catch (error) {
      console.error('Error sending audio:', error);
    } finally {
      setIsSending(false);
    }
  };

  const doSendAsDocument = async () => {
    if (!audioBlob || !onSendAsDocument) return;
    setIsSending(true);
    try {
      await onSendAsDocument(audioBlob);
      logAudioEvent('audio_record_fallback_webm_document', {
        ...telemetryCtx,
        mimeType: audioBlob.type || null,
        durationMs: recordingTime * 1000,
        sizeBytes: audioBlob.size,
      });
      resetRecording();
    } catch (error) {
      console.error('Error sending audio as document:', error);
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // WebM → document confirmation banner
  if (audioBlob && needsDocumentConfirm) {
    return (
      <div className="flex flex-col gap-2 bg-muted rounded-lg px-3 py-2 w-full">
        <p className="text-xs text-muted-foreground">
          Seu navegador gerou um áudio em formato não compatível com WhatsApp. Enviar como <strong>arquivo</strong>?
          O destinatário verá um anexo em vez do player de áudio.
        </p>

        <div className="flex items-center gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={resetRecording} disabled={isSending}>Cancelar</Button>
          <Button size="sm" onClick={doSendAsDocument} disabled={isSending}>
            {isSending ? <SpinnerGap className="w-4 h-4 animate-spin" /> : 'Enviar como arquivo'}
          </Button>
        </div>
      </div>
    );
  }

  // Recorded — send/delete
  if (audioBlob) {
    return (
      <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-sm font-medium">{formatTime(recordingTime)}</span>
          <div className="flex-1 h-1 bg-green-200 dark:bg-green-800 rounded-full overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: '100%' }} />
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={cancelRecording} disabled={isSending}
          className="text-destructive hover:text-destructive">
          <TrashSimple className="w-4 h-4" />
        </Button>
        <Button size="icon" onClick={handleSend} disabled={isSending}
          className="bg-green-600 hover:bg-green-700">
          {isSending ? <SpinnerGap className="w-4 h-4 animate-spin" /> : <PaperPlaneTilt className="w-4 h-4" />}
        </Button>
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="flex items-center gap-2 bg-destructive/10 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-sm font-medium text-destructive">{formatTime(recordingTime)}</span>
          <span className="text-xs text-muted-foreground">Gravando...</span>
        </div>
        <Button variant="ghost" size="icon" onClick={cancelRecording} className="text-muted-foreground">
          <TrashSimple className="w-4 h-4" />
        </Button>
        <Button size="icon" onClick={stopRecording} variant="destructive">
          <Square className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="icon" onClick={startRecording} disabled={disabled} title="Gravar áudio">
      <Microphone className="w-4 h-4" />
    </Button>
  );
}

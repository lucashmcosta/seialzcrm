// Local ringback ("tom de chamada" gerado no browser via Web Audio API).
//
// Por quê: entre o clique em "ligar" e o toque real da operadora chegar pelo áudio
// há um gap de setup (call-intent + handshake WebRTC + /voice + disca PSTN) de ~1-2s.
// Esse gap é estrutural (transcontinental) e não dá pra zerar barato. Em vez de deixar
// SILÊNCIO — que faz parecer travado — tocamos um ringback local imediato (como todo
// softphone profissional faz) e passamos a bola pro áudio real assim que a chamada
// começa a tocar. Puro ganho de latência PERCEBIDA; não toca em nada do call flow.
//
// Sem arquivo de áudio: um oscilador 425 Hz (padrão BR de tom de chamada) com a
// cadência 1s on / 4s off, ligado/desligado por envelope de ganho. Só é usado na
// ligação normal (makeCall) — as pernas de transferência/resume seguem sem som.

const RING_FREQ_HZ = 425; // tom de chamada padrão Brasil
const RING_ON_S = 1.0;
const RING_OFF_S = 4.0;
const RING_VOLUME = 0.12; // discreto, só pra dar presença

let audioCtx: AudioContext | null = null;
let osc: OscillatorNode | null = null;
let gain: GainNode | null = null;
let cadenceTimer: ReturnType<typeof setInterval> | null = null;

function ctor(): typeof AudioContext | undefined {
  return window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
}

// DEVE ser chamado dentro do gesto do usuário (o clique de ligar) para o AudioContext
// poder tocar (política de autoplay). É idempotente e à prova de falha (áudio opcional).
export function startRingback(): void {
  try {
    const AC = ctor();
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    stopNodes(); // limpa qualquer ringback anterior antes de recomeçar

    gain = audioCtx.createGain();
    gain.gain.value = 0;
    gain.connect(audioCtx.destination);

    osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = RING_FREQ_HZ;
    osc.connect(gain);
    osc.start();

    // Primeiro "trim" já sai imediato (mascara o gap na hora); depois repete na cadência.
    const ring = () => {
      if (!audioCtx || !gain) return;
      const now = audioCtx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(RING_VOLUME, now);
      gain.gain.setValueAtTime(0, now + RING_ON_S);
    };
    ring();
    cadenceTimer = setInterval(ring, (RING_ON_S + RING_OFF_S) * 1000);
  } catch {
    /* áudio é opcional — nunca deve afetar a chamada */
  }
}

export function stopRingback(): void {
  stopNodes();
}

function stopNodes(): void {
  if (cadenceTimer) {
    clearInterval(cadenceTimer);
    cadenceTimer = null;
  }
  if (gain && audioCtx) {
    try {
      const now = audioCtx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0, now);
    } catch { /* ignore */ }
  }
  if (osc) {
    try { osc.stop(); } catch { /* já parado */ }
    try { osc.disconnect(); } catch { /* ignore */ }
    osc = null;
  }
  if (gain) {
    try { gain.disconnect(); } catch { /* ignore */ }
    gain = null;
  }
}

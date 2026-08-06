// Local ringback ("tom de chamada" gerado no browser via Web Audio API).
//
// Por quê: entre o clique em "ligar" e o toque real da operadora chegar pelo áudio
// há um gap de setup (call-intent + handshake WebRTC + /voice + disca PSTN, ~1-2s)
// que é estrutural (transcontinental) e não dá pra zerar barato. Em vez de SILÊNCIO —
// que faz parecer travado — tocamos um ringback local imediato (como todo softphone
// profissional faz) e passamos a bola pro áudio real quando a chamada começa a tocar.
// Puro ganho de latência PERCEBIDA; não toca em nada do call flow.
//
// Padrão: replica o som "outgoing" do próprio Twilio Voice SDK = ringback americano
// de DUPLO-TOM 440 Hz + 480 Hz, cadência 2s ON / 4s OFF (spec Precise Tone Plan / US).
// Feito com 2 osciladores no mesmo ganho — sem arquivo de áudio. Preferimos a nossa
// versão à do SDK porque (a) começa no CLIQUE (mascara também o call-intent, a do SDK
// só começa no device.connect) e (b) faz LOOP (cobre gaps de qualquer duração, a do
// SDK toca uma vez e corta em 3s). Só é usado na ligação normal (makeCall) — as pernas
// de transferência/resume seguem sem som (o "blip" removido continua removido).

const RING_FREQS_HZ = [440, 480]; // duplo-tom do ringback US (igual ao do Twilio)
const RING_ON_S = 2.0; // 2s tocando
const RING_OFF_S = 4.0; // 4s em silêncio → ciclo de 6s
const RING_VOLUME = 0.32; // mais alto que antes (era 0.12); pico somado ~0.6, sem clipar

let audioCtx: AudioContext | null = null;
let oscillators: OscillatorNode[] = [];
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

    // Um único ganho para os dois tons: o envelope liga/desliga a cadência de uma vez,
    // e o volume somado (2 senóides) fica controlado num ponto só (sem clipar).
    gain = audioCtx.createGain();
    gain.gain.value = 0;
    gain.connect(audioCtx.destination);

    oscillators = RING_FREQS_HZ.map((freq) => {
      const osc = audioCtx!.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain!);
      osc.start();
      return osc;
    });

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
  for (const osc of oscillators) {
    try { osc.stop(); } catch { /* já parado */ }
    try { osc.disconnect(); } catch { /* ignore */ }
  }
  oscillators = [];
  if (gain) {
    try { gain.disconnect(); } catch { /* ignore */ }
    gain = null;
  }
}

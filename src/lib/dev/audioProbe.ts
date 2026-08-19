/**
 * DEV-ONLY passive telemetry for the audio progress bug.
 *
 * Activated only with `?audioProbe=1` in the URL. It NEVER touches the
 * <audio> element state: no play/pause/seek, no src/preload changes, no
 * mutation of the player. It only reads properties and attaches passive
 * counting listeners, then prints a report.
 *
 * Usage:
 *   1. open /commercial?audioProbe=1
 *   2. press play on the audio you want to inspect, let it run ~5s
 *   3. read the console block, or call `__audioProbe.report()`
 *
 * Remove this file (and its loader in main.tsx) once the audit is done.
 */

type Sample = { t: number; currentTime: number; reactTime: string; duration: number };

type Capture = {
  index: number;
  src: string;
  srcKind: string;
  mediaExt: string;
  startedAt: number;
  samples: Sample[];
  rafTicks: number;
  events: Record<string, number>;
  readyState: number[];
  networkState: number[];
  paused: boolean[];
  seekable: string[];
  buffered: string[];
  detachRaf?: () => void;
};

const captures: Capture[] = [];
const seen = new WeakSet<HTMLAudioElement>();

function ranges(list: TimeRanges | null): string {
  if (!list || list.length === 0) return 'none';
  const out: string[] = [];
  for (let i = 0; i < list.length; i++) out.push(`${list.start(i).toFixed(2)}-${list.end(i).toFixed(2)}`);
  return out.join(',');
}

function srcKind(src: string): string {
  try {
    const u = new URL(src, window.location.href);
    if (u.pathname.includes('/functions/v1/twilio-media-proxy')) return 'proxied(twilio-media-proxy)';
    if (u.hostname === 'api.twilio.com') return 'twilio-direct';
    if (u.pathname.includes('/storage/v1/object/public/')) return 'storage-direct-public';
    return `other(${u.hostname})`;
  } catch {
    return 'unparseable';
  }
}

function mediaExt(src: string): string {
  const m = src.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
  return m ? m[1].toLowerCase() : 'noext';
}

/** Reads the time label the player renders — i.e. the React `currentTime` state. */
function reactTimeText(audio: HTMLAudioElement): string {
  const root = audio.parentElement;
  if (!root) return 'n/a';
  const spans = Array.from(root.querySelectorAll('span'));
  const timeLike = spans.find((s) => /^\d+:\d{2}$/.test((s.textContent || '').trim()));
  return timeLike ? (timeLike.textContent || '').trim() : 'n/a';
}

function attach(audio: HTMLAudioElement) {
  if (seen.has(audio)) return;
  seen.add(audio);

  const cap: Capture = {
    index: captures.length + 1,
    src: audio.currentSrc || audio.src,
    srcKind: srcKind(audio.currentSrc || audio.src),
    mediaExt: mediaExt(audio.currentSrc || audio.src),
    startedAt: 0,
    samples: [],
    rafTicks: 0,
    events: {},
    readyState: [],
    networkState: [],
    paused: [],
    seekable: [],
    buffered: [],
  };

  const bump = (name: string) => { cap.events[name] = (cap.events[name] || 0) + 1; };
  (['loadedmetadata', 'canplay', 'durationchange', 'timeupdate', 'progress', 'play', 'playing', 'pause', 'ended', 'seeked', 'stalled', 'waiting', 'error'] as const)
    .forEach((ev) => audio.addEventListener(ev, () => bump(ev), { passive: true }));

  const snapshot = (t: number) => {
    cap.samples.push({
      t,
      currentTime: audio.currentTime,
      reactTime: reactTimeText(audio),
      duration: audio.duration,
    });
    cap.readyState.push(audio.readyState);
    cap.networkState.push(audio.networkState);
    cap.paused.push(audio.paused);
    cap.seekable.push(ranges(audio.seekable));
    cap.buffered.push(ranges(audio.buffered));
  };

  audio.addEventListener('play', () => {
    if (cap.startedAt) return;
    cap.startedAt = performance.now();
    captures.push(cap);
    cap.src = audio.currentSrc || audio.src;
    cap.srcKind = srcKind(cap.src);
    cap.mediaExt = mediaExt(cap.src);
    snapshot(0);

    // independent rAF: only counts frames, proving whether the browser is
    // painting frames while the player's own loop may be dead.
    let raf = 0;
    const tick = () => { cap.rafTicks += 1; raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    cap.detachRaf = () => cancelAnimationFrame(raf);

    [1000, 3000, 5000].forEach((ms) => window.setTimeout(() => snapshot(ms / 1000), ms));
    window.setTimeout(() => {
      cap.detachRaf?.();
      printOne(cap);
    }, 5200);
  }, { passive: true });
}

function printOne(cap: Capture) {
  const s = (i: number) => cap.samples[i];
  const dur = s(0)?.duration;
  const lines = [
    `--- AUDIO_CAPTURE #${cap.index} ---`,
    `AUDIO_SRC=${cap.src}`,
    `AUDIO_SRC_KIND=${cap.srcKind}`,
    `MEDIA_EXT=${cap.mediaExt}`,
    `READY_STATE=${cap.readyState.join(' -> ')}`,
    `NETWORK_STATE=${cap.networkState.join(' -> ')}`,
    `PAUSED=${cap.paused.join(' -> ')}`,
    `DURATION=${cap.samples.map((x) => String(x.duration)).join(' -> ')}`,
    `DURATION_FINITE_AT_START=${Number.isFinite(dur) ? 'YES' : 'NO'}`,
    `CURRENT_TIME_START=${s(0)?.currentTime}`,
    `CURRENT_TIME_AFTER_1S=${s(1)?.currentTime}`,
    `CURRENT_TIME_AFTER_3S=${s(2)?.currentTime}`,
    `CURRENT_TIME_AFTER_5S=${s(3)?.currentTime}`,
    `RAF_TICKS=${cap.rafTicks}`,
    `REACT_CURRENT_TIME_STATE=${cap.samples.map((x) => x.reactTime).join(' -> ')}`,
    `COMPUTED_PROGRESS=${cap.samples.map((x) => (Number.isFinite(x.duration) && x.duration > 0 ? (x.currentTime / x.duration).toFixed(3) : '0(duration invalid)')).join(' -> ')}`,
    `SEEKABLE_RANGES=${cap.seekable.join(' | ')}`,
    `BUFFERED_RANGES=${cap.buffered.join(' | ')}`,
    `LOADEDMETADATA_FIRED=${cap.events.loadedmetadata || 0}`,
    `CANPLAY_FIRED=${cap.events.canplay || 0}`,
    `DURATIONCHANGE_FIRED=${cap.events.durationchange || 0}`,
    `TIMEUPDATE_FIRED=${cap.events.timeupdate || 0}`,
    `OTHER_EVENTS=${JSON.stringify(cap.events)}`,
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}

export function installAudioProbe() {
  const scan = () => document.querySelectorAll('audio').forEach((a) => attach(a as HTMLAudioElement));
  scan();
  const mo = new MutationObserver(scan);
  mo.observe(document.body, { childList: true, subtree: true });

  const api = {
    captures,
    report: () => { captures.forEach(printOne); return captures; },
    json: () => JSON.stringify(captures.map(({ detachRaf, ...rest }) => rest), null, 2),
  };
  (window as unknown as { __audioProbe: typeof api }).__audioProbe = api;
  // eslint-disable-next-line no-console
  console.log('[audioProbe] armed — press play on an audio, wait ~5s, read the AUDIO_CAPTURE block.');
}

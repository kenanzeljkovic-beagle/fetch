/**
 * Local audio feedback for the dialer — generated with the Web Audio API, no
 * asset files needed. Two things: DTMF tones on keypress, and a US-standard
 * ringback tone while a call is dialing (Telnyx doesn't always send early
 * media before the call connects, so without this the rep hears silence).
 */

// Standard DTMF dual-tone frequency pairs (ITU-T Q.23)
const DTMF_FREQS: Record<string, [number, number]> = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
  '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
};

let ctx: AudioContext | null = null;

/** Lazily create the AudioContext on first use — browsers block autoplay before a user gesture. */
function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Plays a short DTMF tone for a keypad digit. Safe to call rapidly; each press is independent. */
export function playDtmf(digit: string, durationMs = 120) {
  const pair = DTMF_FREQS[digit];
  const audioCtx = getContext();
  if (!pair || !audioCtx) return;

  const [f1, f2] = pair;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + durationMs / 1000);
  gain.connect(audioCtx.destination);

  [f1, f2].forEach((freq) => {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start();
    osc.stop(audioCtx.currentTime + durationMs / 1000 + 0.02);
  });
}

// ---- Ringback (US cadence: 440+480 Hz, 2s on / 4s off) ----------------------
let ringbackNodes: { oscA: OscillatorNode; oscB: OscillatorNode; gain: GainNode } | null = null;
let ringbackTimer: ReturnType<typeof setTimeout> | null = null;

export function startRingback() {
  const audioCtx = getContext();
  if (!audioCtx || ringbackNodes) return; // already running

  const gain = audioCtx.createGain();
  gain.gain.value = 0;
  gain.connect(audioCtx.destination);
  const oscA = audioCtx.createOscillator();
  const oscB = audioCtx.createOscillator();
  oscA.type = 'sine'; oscA.frequency.value = 440;
  oscB.type = 'sine'; oscB.frequency.value = 480;
  oscA.connect(gain); oscB.connect(gain);
  oscA.start(); oscB.start();
  ringbackNodes = { oscA, oscB, gain };

  let on = false;
  const cycle = () => {
    if (!ringbackNodes) return;
    on = !on;
    const t = audioCtx.currentTime;
    ringbackNodes.gain.gain.cancelScheduledValues(t);
    ringbackNodes.gain.gain.linearRampToValueAtTime(on ? 0.05 : 0, t + 0.05);
    ringbackTimer = setTimeout(cycle, on ? 2000 : 4000);
  };
  cycle();
}

export function stopRingback() {
  if (ringbackTimer) { clearTimeout(ringbackTimer); ringbackTimer = null; }
  if (ringbackNodes) {
    try { ringbackNodes.oscA.stop(); ringbackNodes.oscB.stop(); } catch { /* already stopped */ }
    ringbackNodes = null;
  }
}

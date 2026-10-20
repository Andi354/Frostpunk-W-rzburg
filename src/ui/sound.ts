import type { GameState } from '../sim/types';
import { snowIntensity } from '../sim/weather';

// Web Audio: wind (looping filtered noise), boiler hum (two low sines), a bell when a document arrives.
// Silent until the player switches it on; without an AudioContext nothing happens.

interface Audio {
  ctx: AudioContext;
  master: GainNode;
  wind: GainNode;
  hum: GainNode;
}

let on = false;
/** undefined: not built yet; null: no Web Audio here */
let audio: Audio | null | undefined;
let lastState: GameState | null = null;
let lastPending = 0;

export function soundOn(): boolean {
  return on;
}

function build(): Audio | null {
  try {
    const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 700;
    const wind = ctx.createGain();
    wind.gain.value = 0;
    noise.connect(lowpass).connect(wind).connect(master);
    noise.start();

    const hum = ctx.createGain();
    hum.gain.value = 0;
    hum.connect(master);
    for (const [freq, level] of [[48, 0.6], [96, 0.25]] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(hum);
      osc.start();
    }
    return { ctx, master, wind, hum };
  } catch {
    return null;
  }
}

/** Turns the sound on or off. Building the audio graph happens here, inside the player's tap. */
export function setSound(v: boolean): void {
  on = v;
  try {
    if (on && audio === undefined) audio = build();
    const a = audio;
    if (!a) return;
    if (on && a.ctx.state === 'suspended') void a.ctx.resume().catch(() => {});
    a.master.gain.setTargetAtTime(on ? 0.8 : 0, a.ctx.currentTime, 0.1);
  } catch {
    /* silent */
  }
}

function ring(a: Audio): void {
  const t = a.ctx.currentTime;
  const osc = a.ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 880;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  osc.connect(g).connect(a.master);
  osc.start(t);
  osc.stop(t + 1.7);
}

/** Called every frame: follows the weather and the boiler, rings for new documents. */
export function soundTick(s: GameState): void {
  if (s !== lastState) {
    lastState = s;
    lastPending = s.events.pending.length;
  }
  const n = s.events.pending.length;
  const fresh = n > lastPending;
  lastPending = n;
  const a = audio;
  if (!a || !on) return;
  try {
    const t = a.ctx.currentTime;
    a.wind.gain.setTargetAtTime(0.04 + 0.3 * snowIntensity(s.time), t, 0.5);
    a.hum.gain.setTargetAtTime(s.gen.on ? 0.035 : 0, t, 0.3);
    if (fresh) ring(a);
  } catch {
    /* silent */
  }
}

// audio.js — tiny synthesised sound: engine hum, ring chime, crash thud.
// One clear job: make noise with WebAudio only — no audio files, no network.

/** Lazily created audio context; nothing plays until the pilot clicks to fly. */
let context = null;
let engineOsc = null;
let engineGain = null;

function ensureContext() {
  if (context) return context;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
    engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(context.destination);
    engineOsc.start();
  } catch {
    context = null;
  }
  return context;
}

/** Start the engine hum (call from the first user gesture). */
export function startAudio() {
  const ctx = ensureContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

/** Engine hum follows the throttle. */
export function setEngine(throttle, speed) {
  if (!context || !engineOsc || !engineGain) return;
  const t = context.currentTime;
  engineOsc.frequency.setTargetAtTime(55 + throttle * 90 + speed * 0.4, t, 0.1);
  engineGain.gain.setTargetAtTime(0.02 + throttle * 0.05, t, 0.1);
}

function blip(frequency, startAt, duration, volume) {
  if (!context) return;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

/** Two-note chime when a ring is flown. */
export function playRingChime() {
  const ctx = ensureContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  blip(660, t, 0.25, 0.18);
  blip(990, t + 0.12, 0.4, 0.18);
}

/** Low thud on a hard landing or crash. */
export function playThud() {
  const ctx = ensureContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  blip(90, t, 0.35, 0.3);
  blip(55, t + 0.05, 0.4, 0.25);
}

/** Short happy arpeggio when the mission completes. */
export function playMissionFanfare() {
  const ctx = ensureContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  [523, 659, 784, 1047].forEach((freq, i) => blip(freq, t + i * 0.13, 0.35, 0.16));
}

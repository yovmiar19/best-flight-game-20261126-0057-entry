// audio.js — Island Hopper v3: WebAudio sounds, spec §2.4.
// Engine (oscillator + filtered noise, follows throttle), wind with speed,
// ring chime rising per combo, crash thud, landing chirp, soft pad loop.
// Starts on first flight; M toggles mute.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null, engineOsc2 = null, engineGain = null, engineFilter = null;
  let noiseSrc = null, noiseGain = null, windGain = null;
  let padOsc = null, padGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);

    // Engine: two detuned saws through a lowpass
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 58;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();

    // Wind: looped filtered noise
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buf;
    noiseSrc.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 700;
    noiseFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(windGain);
    windGain.connect(master);
    noiseSrc.start();

    // Soft pad loop: two slow sines a fifth apart
    padOsc = ctx.createOscillator();
    padOsc.type = 'sine';
    padOsc.frequency.value = 110;
    const padOsc2 = ctx.createOscillator();
    padOsc2.type = 'sine';
    padOsc2.frequency.value = 164.8;
    padGain = ctx.createGain();
    padGain.gain.value = 0.035;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 500;
    padOsc.connect(padFilter);
    padOsc2.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(master);
    padOsc.start();
    padOsc2.start();
  }

  function start() {
    ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    started = true;
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol || 0.25, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  return {
    get muted() { return muted; },
    get started() { return started; },
    start,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    update(state, dt) {
      if (!ctx || !started) return;
      const th = state.throttle;
      const target = state.onGround ? 0.02 + th * 0.05 : 0.03 + th * 0.09;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      const f = 55 + th * 90 + state.speed * 0.35;
      engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.1);
      engineOsc2.frequency.setTargetAtTime(f * 1.01 + 2, ctx.currentTime, 0.1);
      engineFilter.frequency.setTargetAtTime(280 + th * 900, ctx.currentTime, 0.1);
      const wind = state.onGround ? 0 : Math.min(0.22, (state.speed / 62) * 0.22);
      windGain.gain.setTargetAtTime(wind, ctx.currentTime, 0.15);
    },
    ring(combo) {
      if (!ctx) return;
      const base = 523 * Math.pow(1.122, Math.min(combo - 1, 7));
      tone(base, 0.35, 'sine', 0.3);
      tone(base * 1.5, 0.4, 'sine', 0.22, 0.07);
    },
    crash() {
      if (!ctx) return;
      tone(70, 0.5, 'sine', 0.5);
      tone(45, 0.7, 'triangle', 0.4, 0.05);
    },
    hardLanding() { if (ctx) tone(90, 0.3, 'sine', 0.35); },
    chirp() {
      if (!ctx) return;
      tone(880, 0.15, 'sine', 0.25);
      tone(1174, 0.2, 'sine', 0.25, 0.12);
    },
    canister() {
      if (!ctx) return;
      tone(660, 0.18, 'sine', 0.25);
      tone(990, 0.25, 'sine', 0.22, 0.09);
    },
    takeoff() { if (ctx) tone(392, 0.3, 'sine', 0.2); },
  };
}

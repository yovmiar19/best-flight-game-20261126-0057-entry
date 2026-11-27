// audio.js — WebAudio: jet engine hum, wind noise, rising chimes, music pad.
// Fresh write from polish-spec.md §9. All audio starts only on first gesture.
export function createAudio() {
  const a = {
    ctx: null, master: null, muted: false,
    engineOsc: null, engineGain: null, engineFilter: null,
    windSrc: null, windGain: null, windFilter: null,
    musicOsc1: null, musicOsc2: null, musicGain: null, musicStarted: false,
    started: false,
  };

  function ensure() {
    if (a.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    a.ctx = new AC();
    a.master = a.ctx.createGain();
    a.master.gain.value = a.muted ? 0 : 1;
    a.master.connect(a.ctx.destination);

    // Engine hum: sawtooth 70 Hz + lowpass 400 Hz, pitch follows throttle+speed.
    a.engineOsc = a.ctx.createOscillator();
    a.engineOsc.type = 'sawtooth';
    a.engineOsc.frequency.value = 70;
    a.engineFilter = a.ctx.createBiquadFilter();
    a.engineFilter.type = 'lowpass';
    a.engineFilter.frequency.value = 400;
    a.engineGain = a.ctx.createGain();
    a.engineGain.gain.value = 0.0;
    a.engineOsc.connect(a.engineFilter);
    a.engineFilter.connect(a.engineGain);
    a.engineGain.connect(a.master);
    a.engineOsc.start();

    // Wind noise: looped filtered-noise buffer.
    const len = a.ctx.sampleRate * 2;
    const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    a.windSrc = a.ctx.createBufferSource();
    a.windSrc.buffer = buf;
    a.windSrc.loop = true;
    a.windFilter = a.ctx.createBiquadFilter();
    a.windFilter.type = 'bandpass';
    a.windFilter.frequency.value = 900;
    a.windFilter.Q.value = 0.6;
    a.windGain = a.ctx.createGain();
    a.windGain.gain.value = 0;
    a.windSrc.connect(a.windFilter);
    a.windFilter.connect(a.windGain);
    a.windGain.connect(a.master);
    a.windSrc.start();
  }

  function startMusic() {
    if (!a.ctx || a.musicStarted) return;
    a.musicStarted = true;
    a.musicGain = a.ctx.createGain();
    a.musicGain.gain.value = 0.015;
    a.musicOsc1 = a.ctx.createOscillator();
    a.musicOsc1.type = 'triangle';
    a.musicOsc1.frequency.value = 220;
    a.musicOsc2 = a.ctx.createOscillator();
    a.musicOsc2.type = 'triangle';
    a.musicOsc2.frequency.value = 220 * 1.005; // detuned
    a.musicOsc2.frequency.value = 277.18; // slow pad chord tone
    a.musicOsc1.connect(a.musicGain);
    a.musicOsc2.connect(a.musicGain);
    a.musicGain.connect(a.master);
    a.musicOsc1.start();
    a.musicOsc2.start();
  }

  a.unlock = function () {
    ensure();
    if (a.ctx && a.ctx.state === 'suspended') a.ctx.resume();
    startMusic();
    a.started = true;
  };

  // Per-frame: engine pitch + gain follow throttle/speed; wind gain follows speed.
  a.update = function (throttle, speed, maxSpeed) {
    if (!a.ctx) return;
    const t = a.ctx.currentTime;
    const frac = speed / maxSpeed;
    a.engineOsc.frequency.setTargetAtTime(70 + throttle * 60 + frac * 40, t, 0.1);
    a.engineGain.gain.setTargetAtTime(0.05 + throttle * 0.06 + frac * 0.03, t, 0.1);
    const windTarget = speed < 20 ? 0 : 0.08 * ((speed - 20) / (maxSpeed - 20));
    a.windGain.gain.setTargetAtTime(Math.max(0, windTarget), t, 0.15);
  };

  function blip(freq, dur, when, type, gainVal) {
    if (!a.ctx) return;
    const o = a.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0, a.ctx.currentTime + when);
    g.gain.linearRampToValueAtTime(gainVal || 0.2, a.ctx.currentTime + when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, a.ctx.currentTime + when + dur);
    o.connect(g); g.connect(a.master);
    o.start(a.ctx.currentTime + when);
    o.stop(a.ctx.currentTime + when + dur + 0.05);
  }

  // Rising-pitch chime: base 660 Hz + 60 Hz x ringsFlown, two notes.
  a.chime = function (ringsFlown) {
    if (!a.ctx) return;
    const base = 660 + 60 * ringsFlown;
    blip(base, 0.35, 0, 'sine', 0.22);
    blip(base * 1.5, 0.5, 0.12, 'sine', 0.22);
  };

  // Landing chirp: two short high blips.
  a.chirp = function () {
    if (!a.ctx) return;
    blip(1320, 0.12, 0, 'sine', 0.18);
    blip(1760, 0.16, 0.1, 'sine', 0.18);
  };

  // Crash thud.
  a.thud = function () {
    if (!a.ctx) return;
    const o = a.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, a.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, a.ctx.currentTime + 0.3);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.5, a.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.ctx.currentTime + 0.35);
    o.connect(g); g.connect(a.master);
    o.start(); o.stop(a.ctx.currentTime + 0.4);
  };

  // Mission fanfare: rising arpeggio.
  a.fanfare = function () {
    if (!a.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => blip(f, 0.4, i * 0.14, 'triangle', 0.2));
  };

  a.toggleMute = function () {
    a.muted = !a.muted;
    if (a.master) a.master.gain.value = a.muted ? 0 : 1;
    return a.muted;
  };

  return a;
}

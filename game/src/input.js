// input.js — Keyboard + mouse-drag look + touch stick/slider + basic gamepad.
// Fresh write from polish-spec.md §10.
export function createInput(doc, callbacks) {
  const input = {
    pitch: 0, bank: 0, throttleUp: false, throttleDown: false, throttleSet: null,
    lookX: 0, lookY: 0, // mouse-drag look offsets (decay in main loop)
    touchPitch: 0, touchBank: 0, touchThrottle: null,
    isTouch: ('ontouchstart' in window) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches),
  };
  const keys = {};
  const cb = callbacks || {};

  function keyPitch() {
    // ArrowUp = nose down (push), ArrowDown = pull up. Also W/S are throttle.
    let p = 0;
    if (keys['ArrowDown']) p += 1;
    if (keys['ArrowUp']) p -= 1;
    return p;
  }
  function keyBank() {
    let b = 0;
    if (keys['ArrowRight']) b += 1;
    if (keys['ArrowLeft']) b -= 1;
    return b;
  }
  function recompute() {
    input.pitch = Math.max(-1, Math.min(1, keyPitch() + input.touchPitch));
    input.bank = Math.max(-1, Math.min(1, keyBank() + input.touchBank));
    input.throttleUp = !!keys['KeyW'];
    input.throttleDown = !!keys['KeyS'];
    input.throttleSet = input.touchThrottle;
  }

  doc.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'KeyM' && cb.onMute) cb.onMute();
    if (e.code === 'KeyR' && cb.onReset) cb.onReset();
    if (e.code === 'Enter' || e.code === 'Space') {
      if (cb.onAdvance) cb.onAdvance();
      e.preventDefault();
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    recompute();
  });
  doc.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    recompute();
  });
  doc.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    recompute();
  });

  // Mouse-drag look-around (offsets decay in main.js)
  let dragging = false, lastX = 0, lastY = 0;
  const canvas = doc.getElementById('scene');
  if (canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    doc.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      input.lookX += (e.clientX - lastX) * 0.003;
      input.lookY += (e.clientY - lastY) * 0.003;
      input.lookY = Math.max(-0.6, Math.min(0.6, input.lookY));
      input.lookX = Math.max(-1.2, Math.min(1.2, input.lookX));
      lastX = e.clientX; lastY = e.clientY;
    });
    doc.addEventListener('pointerup', () => { dragging = false; });
  }

  // ---- Touch controls: left stick (pitch/bank) + right throttle slider ----
  const stick = doc.getElementById('touch-stick');
  const stickKnob = doc.getElementById('touch-knob');
  const slider = doc.getElementById('touch-throttle');
  const sliderFill = doc.getElementById('touch-throttle-fill');
  if (input.isTouch) {
    const tc = doc.getElementById('touch-controls');
    if (tc) tc.style.display = 'block';
  }
  if (stick) {
    let stickId = null;
    const setStick = (e) => {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2);
      let dy = (e.clientY - cy) / (r.height / 2);
      dx = Math.max(-1, Math.min(1, dx));
      dy = Math.max(-1, Math.min(1, dy));
      input.touchBank = dx;
      input.touchPitch = -dy; // drag up = pull up
      if (stickKnob) stickKnob.style.transform = 'translate(' + (dx * 28) + 'px,' + (dy * 28) + 'px)';
      recompute();
    };
    stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); setStick(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) setStick(e); });
    const endStick = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      input.touchBank = 0; input.touchPitch = 0;
      if (stickKnob) stickKnob.style.transform = 'translate(0,0)';
      recompute();
    };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);
  }
  if (slider) {
    let sliderId = null;
    const setSlider = (e) => {
      const r = slider.getBoundingClientRect();
      let frac = 1 - (e.clientY - r.top) / r.height;
      frac = Math.max(0, Math.min(1, frac));
      input.touchThrottle = frac;
      if (sliderFill) sliderFill.style.height = (frac * 100) + '%';
      recompute();
    };
    slider.addEventListener('pointerdown', (e) => { sliderId = e.pointerId; slider.setPointerCapture(e.pointerId); setSlider(e); });
    slider.addEventListener('pointermove', (e) => { if (e.pointerId === sliderId) setSlider(e); });
    const endSlider = (e) => { if (e.pointerId === sliderId) sliderId = null; };
    slider.addEventListener('pointerup', endSlider);
    slider.addEventListener('pointercancel', endSlider);
  }

  // ---- Basic gamepad poll (best-effort, silent when absent) ----
  input.pollGamepad = function () {
    if (!navigator.getGamepads) return false;
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const ax0 = pad.axes[0] || 0, ax1 = pad.axes[1] || 0;
      if (Math.abs(ax0) > 0.12 || Math.abs(ax1) > 0.12) {
        input.bank = Math.max(-1, Math.min(1, ax0));
        input.pitch = Math.max(-1, Math.min(1, -ax1));
      }
      const rt = pad.buttons[7] ? pad.buttons[7].value : 0;
      if (rt > 0.2) input.throttleUp = true;
      const lt = pad.buttons[6] ? pad.buttons[6].value : 0;
      if (lt > 0.2) input.throttleDown = true;
      if (pad.buttons[0] && pad.buttons[0].pressed && cb.onAdvance) cb.onAdvance();
      return true;
    }
    return false;
  };

  input.resetTouch = function () {
    input.touchPitch = 0; input.touchBank = 0; input.touchThrottle = null;
    if (stickKnob) stickKnob.style.transform = 'translate(0,0)';
    if (sliderFill) sliderFill.style.height = '70%';
    recompute();
  };

  return input;
}

// input.js — Island Hopper v3: input per spec §1.1 (v1 keymap + mouse-look).
// ArrowUp = pitchUp (CLIMB). Touch stick up = climb, stick left = bank left.
// Gamepad maps the same way as the touch stick.

export function createInput(canvas) {
  const keys = new Set();
  const input = {
    // v1 boolean control model (consumed by physics)
    pitchUp: false, pitchDown: false, bankLeft: false, bankRight: false,
    throttleUp: false, throttleDown: false,
    // Mouse-look (spec §1.1)
    lookYaw: 0, lookPitch: 0, dragging: false,
    // Touch stick state (same v1 mapping)
    touch: { active: false, x: 0, y: 0, throttle: 0 },
    // Hooks set by main.js
    onAdvance: null, onReset: null, onMute: null,
    attach, update, resetKeys, setTouchThrottle,
  };

  let lastX = 0, lastY = 0;
  let gamepadIndex = null;

  function refresh() {
    input.pitchUp = keys.has('ArrowUp') || input.touch.y < -0.3 || input._gpPitchUp;
    input.pitchDown = keys.has('ArrowDown') || input.touch.y > 0.3 || input._gpPitchDown;
    input.bankLeft = keys.has('ArrowLeft') || input.touch.x < -0.3 || input._gpBankLeft;
    input.bankRight = keys.has('ArrowRight') || input.touch.x > 0.3 || input._gpBankRight;
    input.throttleUp = keys.has('KeyW') || keys.has('Keyw') || input.touch.throttle > 0.1 || input._gpThrottleUp;
    input.throttleDown = keys.has('KeyS') || keys.has('Keys') || input.touch.throttle < -0.1 || input._gpThrottleDown;
  }

  function attach() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      keys.add(e.code);
      if (e.code === 'Enter' || e.code === 'Space') input.onAdvance && input.onAdvance();
      if (e.code === 'KeyR') input.onReset && input.onReset();
      if (e.code === 'KeyM') input.onMute && input.onMute();
      refresh();
    });
    window.addEventListener('keyup', (e) => { keys.delete(e.code); refresh(); });
    window.addEventListener('blur', () => { resetKeys(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) resetKeys(); });

    // Mouse drag = look around (rotates camera position, spec §1.4)
    canvas.addEventListener('mousedown', (e) => { input.dragging = true; lastX = e.clientX; lastY = e.clientY; });
    window.addEventListener('mouseup', () => { input.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!input.dragging) return;
      input.lookYaw = Math.max(-1.2, Math.min(1.2, input.lookYaw + (e.clientX - lastX) * 0.004));
      input.lookPitch = Math.max(-0.5, Math.min(0.5, input.lookPitch + (e.clientY - lastY) * 0.003));
      lastX = e.clientX; lastY = e.clientY;
    });

    // Gamepad connect
    window.addEventListener('gamepadconnected', (e) => { gamepadIndex = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { gamepadIndex = null; });

    buildTouchControls();
  }

  function resetKeys() {
    keys.clear();
    input.dragging = false;
    input.touch.x = 0; input.touch.y = 0; input.touch.throttle = 0;
    input._gpPitchUp = input._gpPitchDown = input._gpBankLeft = input._gpBankRight = false;
    input._gpThrottleUp = input._gpThrottleDown = false;
    refresh();
  }

  function setTouchThrottle(v) { input.touch.throttle = v; refresh(); }

  function pollGamepad() {
    input._gpPitchUp = input._gpPitchDown = input._gpBankLeft = input._gpBankRight = false;
    input._gpThrottleUp = input._gpThrottleDown = false;
    if (gamepadIndex === null) return;
    const gp = navigator.getGamepads && navigator.getGamepads()[gamepadIndex];
    if (!gp) return;
    const ax = gp.axes[0] || 0; // left stick X: left = bank left
    const ay = gp.axes[1] || 0; // left stick Y: up (negative) = climb
    if (ax < -0.3) input._gpBankLeft = true;
    if (ax > 0.3) input._gpBankRight = true;
    if (ay < -0.3) input._gpPitchUp = true;
    if (ay > 0.3) input._gpPitchDown = true;
    if (gp.buttons[7] && gp.buttons[7].value > 0.3) input._gpThrottleUp = true; // RT
    if (gp.buttons[6] && gp.buttons[6].value > 0.3) input._gpThrottleDown = true; // LT
    if (gp.buttons[9] && gp.buttons[9].pressed) input.onAdvance && input.onAdvance();
    refresh();
  }

  function update(dt) {
    pollGamepad();
    // Mouse-look decays back to centre when not dragging (spec §1.1)
    if (!input.dragging) {
      const k = Math.min(1, dt * 2.5);
      input.lookYaw *= 1 - k;
      input.lookPitch *= 1 - k;
    }
    refresh();
  }

  // --- Touch controls: virtual stick (left) + throttle slider (right) ---
  function buildTouchControls() {
    if (!('ontouchstart' in window)) return;
    const stickZone = document.getElementById('touch-stick');
    const thrZone = document.getElementById('touch-throttle');
    if (!stickZone || !thrZone) return;
    stickZone.style.display = 'block';
    thrZone.style.display = 'block';

    const knob = document.getElementById('stick-knob');
    let stickId = null;
    function stickMove(e) {
      const r = stickZone.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2);
      let dy = (e.clientY - cy) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      input.touch.x = dx; input.touch.y = dy; // up = negative y = pitchUp
      if (knob) knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
      refresh();
    }
    stickZone.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stickZone.setPointerCapture(e.pointerId); stickMove(e); });
    stickZone.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e); });
    const stickEnd = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null; input.touch.x = 0; input.touch.y = 0;
      if (knob) knob.style.transform = 'translate(0px, 0px)';
      refresh();
    };
    stickZone.addEventListener('pointerup', stickEnd);
    stickZone.addEventListener('pointercancel', stickEnd);

    const thrFill = document.getElementById('throttle-fill');
    let thrId = null;
    function thrMove(e) {
      const r = thrZone.getBoundingClientRect();
      const v = 1 - (e.clientY - r.top) / r.height; // top = full throttle
      const clamped = Math.max(-1, Math.min(1, v * 2 - 1));
      // Slider position maps to throttle direction: upper half = throttle up
      input.touch.throttle = clamped > 0.15 ? 1 : clamped < -0.15 ? -1 : 0;
      if (thrFill) thrFill.style.height = `${Math.max(0, Math.min(100, v * 100))}%`;
      refresh();
    }
    thrZone.addEventListener('pointerdown', (e) => { thrId = e.pointerId; thrZone.setPointerCapture(e.pointerId); thrMove(e); });
    thrZone.addEventListener('pointermove', (e) => { if (e.pointerId === thrId) thrMove(e); });
    const thrEnd = (e) => { if (e.pointerId === thrId) { thrId = null; input.touch.throttle = 0; refresh(); } };
    thrZone.addEventListener('pointerup', thrEnd);
    thrZone.addEventListener('pointercancel', thrEnd);
  }

  refresh();
  return input;
}

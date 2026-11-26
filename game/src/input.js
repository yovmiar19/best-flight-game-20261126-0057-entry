// input.js — keyboard + mouse: read the pilot's hands, nothing else.
// One clear job: turn DOM events into a plain input state the physics can read.

/** Fresh input state. */
export function freshInput() {
  return {
    pitchUp: false,
    pitchDown: false,
    bankLeft: false,
    bankRight: false,
    throttleUp: false,
    throttleDown: false,
    /** Mouse-drag look offset in radians: { yaw, pitch }. Decays to zero on release. */
    lookYaw: 0,
    lookPitch: 0,
    dragging: false,
  };
}

const KEYMAP = {
  ArrowUp: 'pitchUp',
  ArrowDown: 'pitchDown',
  ArrowLeft: 'bankLeft',
  ArrowRight: 'bankRight',
  w: 'throttleUp',
  W: 'throttleUp',
  s: 'throttleDown',
  S: 'throttleDown',
};

/** Attach keyboard + mouse listeners to the window and canvas. */
export function bindInput(input, canvas, onReset) {
  window.addEventListener('keydown', (event) => {
    const field = KEYMAP[event.key];
    if (field) {
      input[field] = true;
      event.preventDefault();
    }
    if (event.key === 'r' || event.key === 'R') onReset();
  });
  window.addEventListener('keyup', (event) => {
    const field = KEYMAP[event.key];
    if (field) input[field] = false;
  });
  window.addEventListener('blur', () => {
    for (const key of Object.keys(KEYMAP)) input[KEYMAP[key]] = false;
    input.dragging = false;
  });

  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('mousedown', (event) => {
    input.dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  window.addEventListener('mousemove', (event) => {
    if (!input.dragging) return;
    input.lookYaw += (event.clientX - lastX) * 0.004;
    input.lookPitch += (event.clientY - lastY) * 0.003;
    input.lookPitch = Math.max(-0.5, Math.min(0.5, input.lookPitch));
    input.lookYaw = Math.max(-1.2, Math.min(1.2, input.lookYaw));
    lastX = event.clientX;
    lastY = event.clientY;
  });
  window.addEventListener('mouseup', () => {
    input.dragging = false;
  });
}

/** Ease the look offset back to zero once the mouse is released. */
export function decayLook(input, dt) {
  if (input.dragging) return;
  const k = Math.min(1, dt * 2.5);
  input.lookYaw *= 1 - k;
  input.lookPitch *= 1 - k;
}

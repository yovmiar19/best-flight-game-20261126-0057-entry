// physics.js — Island Hopper v3: physics EXACTLY per spec §1.2 (v1 formulas).
// No visual code here. All constants and signs are verbatim from polish-spec-v3.md.

export const MAX_SPEED = 62; // m/s
export const STALL_SPEED = 15;
export const TAKEOFF_SPEED = 18;
export const FUEL_DRAIN = 0.45; // % per second at full throttle
export const CRASH_PENALTY = 30; // seconds added to time on crash

export const RUNWAY = { x: 0, z: 60, length: 220, width: 16, heading: 0, altitude: 8 };

export function freshState() {
  return {
    pos: { x: RUNWAY.x, y: RUNWAY.altitude + 1.6, z: RUNWAY.z + RUNWAY.length / 2 - 12 },
    heading: 0, // facing north (-Z)
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: 100,
    damage: 0,
    score: 0,
    ringsFlown: 0,
    vy: 0,
    onGround: true,
    stalled: false,
    time: 0,
    crashed: false,
    landed: false,
    lastLanding: null,
    airTime: 0,
  };
}

// Keep score / rings / time across a crash respawn; everything else is fresh.
export function respawnState(old) {
  const s = freshState();
  s.score = old.score;
  s.ringsFlown = old.ringsFlown;
  s.time = old.time;
  return s;
}

export function refuelAndRepair(state) {
  const fuelAdded = 100 - state.fuel;
  const repaired = state.damage;
  state.fuel = 100;
  state.damage = 0;
  return { fuelAdded, repaired };
}

// One physics step. `input` is { pitchUp, pitchDown, bankLeft, bankRight,
// throttleUp, throttleDown }. `world` is { groundHeightAt, overRunway }.
// Returns an array of events: { type: 'takeoff' | 'landed' | 'hard-landing' | 'crash',
//   landing?: { grade, bonus } }.
export function stepPhysics(state, input, dt, world) {
  const events = [];
  if (dt <= 0) return events;
  dt = Math.min(dt, 0.05);

  // Throttle
  if (input.throttleUp) state.throttle = Math.min(1, state.throttle + dt * 0.55);
  if (input.throttleDown) state.throttle = Math.max(0, state.throttle - dt * 0.7);

  // Fuel
  if (state.fuel > 0) {
    state.fuel -= state.throttle * FUEL_DRAIN * dt;
    if (state.fuel <= 0) { state.fuel = 0; state.throttle = 0; }
  } else {
    state.throttle = 0;
  }

  // Speed chases throttle exponentially
  const targetSpeed = state.throttle * MAX_SPEED;
  state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 0.55);

  // Pitch / roll chase FIXED targets (target-based, not rate-based)
  const pitchTarget = (input.pitchUp ? 0.32 : 0) + (input.pitchDown ? -0.28 : 0);
  const rollTarget = (input.bankLeft ? 0.85 : 0) + (input.bankRight ? -0.85 : 0);
  const steer = Math.min(1, dt * 3.2);
  state.pitch += (pitchTarget - state.pitch) * steer;
  state.roll += (rollTarget - state.roll) * steer;

  // Turn — note the minus sign: this is the v1 formula verbatim, do not "fix" it.
  state.heading += -state.roll * (state.speed / MAX_SPEED) * dt * 0.85;

  // Stall
  state.stalled = !state.onGround && state.speed < STALL_SPEED;
  if (state.stalled) state.pitch = Math.max(-0.5, state.pitch - dt * 0.6);

  // Vertical speed from pitch (v1: 2D integration, vy derived, not 3D)
  if (state.onGround) {
    state.vy = 0;
  } else if (state.speed > STALL_SPEED) {
    state.vy = Math.sin(state.pitch) * state.speed * 0.92;
  } else {
    state.vy = Math.max(-9, state.vy - dt * 14);
  }

  // Move
  const forward = { x: -Math.sin(state.heading), z: -Math.cos(state.heading) };
  state.pos.x += forward.x * state.speed * dt;
  state.pos.z += forward.z * state.speed * dt;
  state.pos.y += state.vy * dt;

  // World bounds: clamp + turn around (v1)
  const dist = Math.hypot(state.pos.x, state.pos.z);
  if (dist > 1500) {
    state.pos.x *= 1500 / dist;
    state.pos.z *= 1500 / dist;
    state.heading += Math.PI;
  }
  if (state.pos.y > 420) { state.pos.y = 420; state.vy = Math.min(state.vy, 0); }

  if (!state.onGround) state.airTime += dt;
  state.time += dt;

  // Ground contact
  const ground = world.groundHeightAt(state.pos.x, state.pos.z);
  if (state.pos.y <= ground + 1.6) {
    state.pos.y = ground + 1.6;
    if (state.onGround) {
      // Still on the ground: takeoff only with ArrowUp + speed >= 18
      const liftVy = Math.sin(state.pitch) * state.speed * 0.92;
      if (state.speed >= TAKEOFF_SPEED && liftVy > 0.5) {
        state.onGround = false;
        state.vy = liftVy;
        state.airTime = 0;
        events.push({ type: 'takeoff' });
      }
    } else {
      // Touchdown
      const realFlight = state.airTime > 2;
      const hard = state.vy < -6;
      const onStrip = world.overRunway(state.pos.x, state.pos.z) && Math.abs(state.roll) < 0.35;
      if (onStrip && !hard) {
        const aligned = Math.abs(state.roll) < 0.15;
        let grade, bonus = 0;
        if (realFlight && state.vy >= -2.5 && aligned) { grade = 'BUTTER'; bonus = 500; }
        else if (realFlight && state.vy >= -4.5) { grade = 'FIRM'; bonus = 200; }
        else { grade = realFlight ? 'HARD' : 'FIRM'; bonus = 0; if (realFlight) state.damage += 1; }
        state.onGround = true;
        state.vy = 0;
        state.pitch = 0;
        state.roll = 0;
        state.lastLanding = { grade, bonus };
        events.push({ type: 'landed', landing: { grade, bonus } });
      } else if (ground > 0.5) {
        // Rough terrain
        state.damage += (state.speed > 30 || hard) ? 2 : 1;
        state.onGround = true;
        state.speed *= 0.4;
        state.vy = 0;
        state.lastLanding = { grade: 'HARD', bonus: 0 };
        events.push({ type: state.damage >= 3 ? 'crash' : 'hard-landing', landing: { grade: 'HARD', bonus: 0 } });
      } else {
        // Water
        state.damage = 3;
        state.lastLanding = { grade: 'HARD', bonus: 0 };
        events.push({ type: 'crash', landing: { grade: 'HARD', bonus: 0 } });
      }
    }
  }

  // Damage >= 3 (and the event was not already a crash) => crash
  if (state.damage >= 3 && !events.some((e) => e.type === 'crash')) {
    events.push({ type: 'crash' });
  }
  if (events.some((e) => e.type === 'crash')) {
    state.crashed = true;
    state.time += CRASH_PENALTY;
  }
  return events;
}

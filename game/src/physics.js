// physics.js — Island Hopper flight model (polish spec §3).
// MAX_SPEED 62, TAKEOFF 18, STALL 12 (forgiving), FUEL_DRAIN 0.30 %/s at full
// throttle, ring pass +15% fuel, air start + air respawn with 2 s invulnerability.
import * as THREE from 'three';
import { MAX_SPEED } from './plane.js';
import { RUNWAY, groundHeightAt, overRunway } from './terrain.js';

export const TAKEOFF_SPEED = 18;
export const STALL_SPEED = 12;
export const FUEL_DRAIN = 0.30;
export const WORLD_RADIUS = 1500;
export const MAX_ALT = 420;

export function headingToRing(pos, ring) {
  const rx = ring.pos ? ring.pos.x : ring.x;
  const rz = ring.pos ? ring.pos.z : ring.z;
  return Math.atan2(rx - pos.x, -(rz - pos.z));
}

// Fresh state: START IN THE AIR — altitude 55, speed 45, throttle 0.7,
// heading toward ring 1, onGround false, airTime 0.
export function createState(ring1) {
  const state = {
    pos: new THREE.Vector3(0, 55, 200),
    heading: 0, pitch: 0, roll: 0,
    speed: 45, throttle: 0.7,
    fuel: 100, score: 0, ringsFlown: 0, combo: 0,
    damage: 0, airTime: 0, time: 0,
    onGround: false, invuln: 0, crashed: false, landed: false,
    grade: null, vy: 0, stallWarn: false,
  };
  if (ring1) state.heading = headingToRing(state.pos, ring1);
  return state;
}

// Parked on the runway (R / reset target).
export function resetToRunway(state) {
  state.pos.set(RUNWAY.x, RUNWAY.alt + 1.2, RUNWAY.z + 100);
  state.heading = 0; // forward (0,0,-1) = north, along the runway
  state.pitch = 0; state.roll = 0;
  state.speed = 0; state.throttle = 0;
  state.onGround = true; state.airTime = 0; state.vy = 0;
  state.invuln = 0; state.crashed = false;
}

// Respawn IN THE AIR after a crash: altitude 60, speed 40, facing next ring,
// 2 s invulnerability. Score, rings and time are kept.
export function respawnInAir(state, nextRing) {
  state.pos.set(0, 60, 200);
  if (nextRing) {
    // Position behind the next ring so the player flies straight at it.
    const rx = nextRing.pos ? nextRing.pos.x : nextRing.x;
    const rz = nextRing.pos ? nextRing.pos.z : nextRing.z;
    const dx = rx, dz = rz;
    const d = Math.hypot(dx, dz) || 1;
    state.pos.set(dx - (dx / d) * 220, 60, dz - (dz / d) * 220);
    state.heading = headingToRing(state.pos, nextRing);
  }
  state.pitch = 0; state.roll = 0;
  state.speed = 40; state.throttle = 0.7;
  state.onGround = false; state.airTime = 0; state.vy = 0;
  state.invuln = 2; state.crashed = false;
}

// Step the flight model one frame. Returns an array of events:
// {type:'ring', index} {type:'canister', index} {type:'land', grade}
// {type:'crash', reason} {type:'takeoff'}
export function stepPhysics(state, input, dt, ctx) {
  const events = [];
  const { rings, canisters } = ctx;

  if (state.crashed || state.landed) return events;

  state.time += dt;
  if (state.invuln > 0) state.invuln -= dt;

  // ---- Throttle ----
  if (input.throttleUp) state.throttle = Math.min(1, state.throttle + dt * 0.5);
  if (input.throttleDown) state.throttle = Math.max(0, state.throttle - dt * 0.5);
  if (input.throttleSet != null) state.throttle = Math.max(0, Math.min(1, input.throttleSet));
  if (state.fuel <= 0) state.throttle = 0;

  // ---- Pitch / roll with gentle auto-level ----
  const PITCH_RATE = 1.2, ROLL_RATE = 1.8, LEVEL_RATE = 1.2;
  if (input.pitch !== 0) {
    state.pitch += input.pitch * PITCH_RATE * dt;
  } else {
    state.pitch += (0 - state.pitch) * Math.min(1, LEVEL_RATE * dt);
  }
  if (input.bank !== 0) {
    state.roll += input.bank * ROLL_RATE * dt;
  } else {
    state.roll += (0 - state.roll) * Math.min(1, LEVEL_RATE * dt);
  }
  state.pitch = Math.max(-0.6, Math.min(0.6, state.pitch));
  state.roll = Math.max(-1.1, Math.min(1.1, state.roll));

  // ---- Banking turns the plane (factor 1.0) ----
  const speedFrac = Math.max(0, state.speed / MAX_SPEED);
  state.heading += state.roll * 1.0 * (0.35 + 0.65 * speedFrac) * dt;

  // ---- Speed ----
  const targetSpeed = state.throttle * MAX_SPEED;
  const climbBleed = state.pitch > 0 ? state.pitch * 6 : 0;
  const desired = Math.max(0, targetSpeed - climbBleed);
  const accel = desired > state.speed ? 9 : 7;
  state.speed += Math.max(-accel * dt, Math.min(accel * dt, desired - state.speed));

  // ---- Stall: gentle nose-drop (0.3/s), altitude falls ----
  const stalled = !state.onGround && state.speed < STALL_SPEED;
  state.stallWarn = stalled;
  if (stalled) {
    state.pitch -= 0.3 * dt;
    state.pitch = Math.max(-0.6, state.pitch);
  }

  // ---- Integrate position ----
  const fwd = new THREE.Vector3(
    Math.sin(state.heading) * Math.cos(state.pitch),
    Math.sin(state.pitch),
    -Math.cos(state.heading) * Math.cos(state.pitch)
  );
  const prevY = state.pos.y;
  state.pos.addScaledVector(fwd, state.speed * dt);
  state.vy = (state.pos.y - prevY) / Math.max(dt, 1e-6);

  // ---- World bounds: steer back toward the centre ----
  const distC = Math.hypot(state.pos.x, state.pos.z);
  if (distC > WORLD_RADIUS) {
    state.heading = Math.atan2(-state.pos.x, state.pos.z);
  }
  if (state.pos.y > MAX_ALT) { state.pos.y = MAX_ALT; if (state.pitch > 0) state.pitch = 0; }

  // ---- Fuel ----
  if (!state.onGround) {
    state.fuel -= FUEL_DRAIN * state.throttle * dt;
    if (state.fuel < 0) state.fuel = 0;
  }

  // ---- Air time ----
  if (!state.onGround) state.airTime += dt;

  // ---- Takeoff ----
  if (state.onGround && state.speed >= TAKEOFF_SPEED) {
    state.onGround = false;
    state.airTime = 0;
    events.push({ type: 'takeoff' });
  }

  // ---- Ring passes (ordered; only the next ring counts) ----
  const next = rings[state.ringsFlown];
  if (next && !next.passed) {
    const d = state.pos.distanceTo(next.pos);
    if (d < 14) {
      next.passed = true;
      state.ringsFlown++;
      state.combo = state.ringsFlown;
      state.score += 100 * state.ringsFlown;
      state.fuel = Math.min(100, state.fuel + 15);
      events.push({ type: 'ring', index: state.ringsFlown - 1, combo: state.ringsFlown });
    }
  }

  // ---- Fuel canisters (+45%) ----
  for (let i = 0; i < canisters.length; i++) {
    const c = canisters[i];
    if (c.taken) continue;
    if (state.pos.distanceTo(c.pos) < 12) {
      c.taken = true;
      state.fuel = Math.min(100, state.fuel + 45);
      events.push({ type: 'canister', index: i });
    }
  }

  // ---- Ground / water contact ----
  const gh = groundHeightAt(state.pos.x, state.pos.z);
  const clearance = state.pos.y - gh;
  if (!state.onGround && clearance <= 1.2) {
    const onRw = overRunway(state.pos.x, state.pos.z);
    const headingOk = Math.abs(Math.sin(state.heading)) < 0.35; // roughly north/south along runway
    if (onRw && state.vy >= -4.5 && headingOk && state.invuln <= 0) {
      // Landing!
      state.onGround = true;
      state.pos.y = RUNWAY.alt + 1.2;
      state.speed = Math.max(0, state.speed * 0.4);
      state.pitch = 0; state.roll = 0;
      // Aligned = wings near level and heading roughly along the runway (north/south).
      const aligned = Math.abs(state.roll) < 0.35 && headingOk;
      let grade = 'HARD';
      if (state.vy >= -2.5 && aligned && state.airTime > 2) grade = 'BUTTER';
      else if (state.vy >= -4.5) grade = 'FIRM';
      state.grade = grade;
      if (grade === 'BUTTER') state.score += 500;
      else if (grade === 'FIRM') state.score += 200;
      if (grade === 'HARD') {
        state.damage += 1;
        if (state.damage >= 3) {
          state.time += 30;
          events.push({ type: 'crash', reason: 'hard-landing' });
          return events;
        }
      }
      if (grade === 'BUTTER' || grade === 'FIRM') {
        state.fuel = 100;
        state.damage = 0; // refuel + repair on a good landing
      }
      events.push({ type: 'land', grade });
      if (state.ringsFlown >= 8) {
        state.landed = true;
        events.push({ type: 'finish' });
      }
    } else if (state.invuln > 0) {
      // Bounce off harmlessly during invulnerability
      state.pos.y = gh + 1.3;
      if (state.vy < 0) state.pitch = 0.1;
    } else {
      // Crash: terrain or water. Counts as a hit toward the 3-hit limit.
      const reason = gh <= 0.5 ? 'water' : 'terrain';
      state.damage += 1;
      state.time += 30;
      events.push({ type: 'crash', reason });
    }
  }

  // ---- Rolling on the runway: friction + steering ----
  if (state.onGround) {
    state.speed = Math.max(0, state.speed - 4 * dt);
    if (state.speed < 0.5) state.speed = 0;
    state.pos.y = RUNWAY.alt + 1.2;
  }

  return events;
}

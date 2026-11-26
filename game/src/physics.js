// physics.js — the arcade flight model: throttle, lift, stall, fuel, damage, crashes.
// One clear job: move the plane's state forward one step, with no rendering in it.

import * as THREE from 'three';
import { groundHeightAt, overRunway, RUNWAY } from './terrain.js';

export const MAX_SPEED = 62; // m/s at full throttle (~223 km/h)
export const STALL_SPEED = 15; // m/s — below this the nose drops
export const TAKEOFF_SPEED = 18; // m/s — wheels leave the runway
export const FUEL_DRAIN = 0.45; // % per second at full throttle
export const CRASH_PENALTY_SECONDS = 30;

/** Fresh flight state, parked at the south end of the runway, facing north. */
export function freshState() {
  return {
    pos: new THREE.Vector3(RUNWAY.x, RUNWAY.altitude + 1.6, RUNWAY.z + RUNWAY.length / 2 - 12),
    heading: 0,
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
    message: '',
    messageUntil: 0,
  };
}

/** Forward direction from heading (0 = north, -Z). */
export function forwardOf(heading) {
  return new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
}

/**
 * Advance the flight state by dt seconds.
 * input: { pitchUp, pitchDown, bankLeft, bankRight, throttleUp, throttleDown }
 * Returns an event string ('takeoff' | 'landed' | 'hard-landing' | 'crash' | '').
 */
export function stepFlight(state, input, dt) {
  let event = '';
  state.time += dt;

  // Throttle.
  if (input.throttleUp) state.throttle = Math.min(1, state.throttle + dt * 0.55);
  if (input.throttleDown) state.throttle = Math.max(0, state.throttle - dt * 0.7);

  // Fuel: drains with throttle; empty tank forces a glide.
  if (state.fuel > 0) {
    state.fuel = Math.max(0, state.fuel - state.throttle * FUEL_DRAIN * dt);
    if (state.fuel === 0) state.throttle = 0;
  }

  // Speed chases the throttle setting.
  const targetSpeed = state.throttle * MAX_SPEED;
  state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 0.55);

  // Pitch: ArrowUp climbs, ArrowDown descends. Bank: arrows turn the plane.
  const pitchTarget = (input.pitchUp ? 0.32 : 0) + (input.pitchDown ? -0.28 : 0);
  const rollTarget = (input.bankLeft ? 0.85 : 0) + (input.bankRight ? -0.85 : 0);
  const steer = Math.min(1, dt * 3.2);
  state.pitch += (pitchTarget - state.pitch) * steer;
  state.roll += (rollTarget - state.roll) * steer;

  // Turning: bank tilts the lift vector, so heading follows the roll.
  state.heading += -state.roll * (state.speed / MAX_SPEED) * dt * 0.85;

  // Stall: below minimum speed the wing stops lifting and the nose drops.
  state.stalled = !state.onGround && state.speed < STALL_SPEED;
  if (state.stalled) {
    state.pitch = Math.max(-0.5, state.pitch - dt * 0.6);
  }

  // Vertical speed from pitch and speed (lift), gravity when stalled or slow.
  if (state.onGround) {
    state.vy = 0;
  } else if (state.speed > STALL_SPEED) {
    state.vy = Math.sin(state.pitch) * state.speed * 0.92;
  } else {
    state.vy = Math.max(-9, state.vy - dt * 14);
  }

  // Move.
  const forward = forwardOf(state.heading);
  state.pos.x += forward.x * state.speed * dt;
  state.pos.z += forward.z * state.speed * dt;
  state.pos.y += state.vy * dt;

  // Keep the plane inside the world.
  const R = 1500;
  const dist = Math.hypot(state.pos.x, state.pos.z);
  if (dist > R) {
    state.pos.x *= R / dist;
    state.pos.z *= R / dist;
    state.heading += Math.PI;
  }
  if (state.pos.y > 420) {
    state.pos.y = 420;
    state.vy = Math.min(state.vy, 0);
  }

  // Air time: only a real flight earns a landing bonus (stops taxi-bounce farming).
  if (!state.onGround) state.airTime += dt;

  // Ground contact.
  const ground = groundHeightAt(state.pos.x, state.pos.z);
  if (state.pos.y <= ground + 1.6) {
    state.pos.y = ground + 1.6;
    if (state.onGround) {
      // Takeoff needs lift, not just speed: the pilot must pull up (ArrowUp).
      // Rolling fast on the runway is taxiing, not flying — no takeoff, no bounce.
      const liftVy = Math.sin(state.pitch) * state.speed * 0.92;
      if (state.speed >= TAKEOFF_SPEED && liftVy > 0.5) {
        state.onGround = false;
        state.vy = liftVy;
        state.airTime = 0;
        event = 'takeoff';
      }
    } else {
      // Touchdown: grade it from vertical speed + alignment, then decide the outcome.
      // BUTTER: vy >= -2.5 and level wings (+500) · FIRM: vy >= -4.5 (+200) · HARD: -1 hull.
      // A hop under 2 s of air time is an aborted takeoff: it lands, but earns no bonus.
      const realFlight = state.airTime > 2;
      const hard = state.vy < -6;
      const onStrip = overRunway(state.pos.x, state.pos.z) && Math.abs(state.roll) < 0.35;
      if (onStrip && !hard) {
        const aligned = Math.abs(state.roll) < 0.15;
        if (realFlight && state.vy >= -2.5 && aligned) {
          state.lastLanding = { grade: 'BUTTER', bonus: 500 };
        } else if (realFlight && state.vy >= -4.5) {
          state.lastLanding = { grade: 'FIRM', bonus: 200 };
        } else {
          state.lastLanding = { grade: realFlight ? 'HARD' : 'FIRM', bonus: 0 };
          if (realFlight) state.damage += 1;
        }
        state.onGround = true;
        state.vy = 0;
        state.pitch = 0;
        state.roll = 0;
        event = 'landed';
      } else if (ground > 0.5) {
        // Rough ground: hard landing damages, a fast hit crashes.
        state.lastLanding = { grade: 'HARD', bonus: 0 };
        state.damage += state.speed > 30 || hard ? 2 : 1;
        state.onGround = true;
        state.speed *= 0.4;
        state.vy = 0;
        event = state.damage >= 3 ? 'crash' : 'hard-landing';
      } else {
        // Water.
        state.lastLanding = { grade: 'HARD', bonus: 0 };
        state.damage = 3;
        event = 'crash';
      }
    }
  }

  // Damage cap: 3 hits = crash, respawn at the runway with the score kept.
  if (state.damage >= 3 && event !== 'crash') event = 'crash';
  if (event === 'crash') {
    state.crashed = true;
    state.time += CRASH_PENALTY_SECONDS;
  }

  return event;
}

/** Put the plane back at the runway start after a crash. Score and rings are kept. */
export function respawnAtRunway(state) {
  const kept = { score: state.score, ringsFlown: state.ringsFlown, time: state.time };
  const fresh = freshState();
  fresh.score = kept.score;
  fresh.ringsFlown = kept.ringsFlown;
  fresh.time = kept.time;
  Object.assign(state, fresh);
  state.crashed = false;
}

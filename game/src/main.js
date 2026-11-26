// main.js — boot + game loop + chase camera + screenshot scenes.
// One clear job: wire every module together and run the game.

import * as THREE from 'three';
import { buildTerrain, RINGS, RUNWAY } from './terrain.js';
import { buildPlane, posePlane, animatePlane } from './plane.js';
import { freshState, stepFlight, respawnAtRunway, forwardOf } from './physics.js';
import {
  buildRings, checkRingPass, refuelAndRepair, missionComplete, nextRingLabel,
  animateRings, comboFor, buildCanisters, checkCanisterPickup, resetRings,
  resetCanisters, updateRingColors,
} from './missions.js';
import { buildHud, updateHud, showBanner } from './hud.js';
import { freshInput, bindInput, decayLook } from './input.js';
import { startAudio, setEngine, playRingChime, playThud, playMissionFanfare } from './audio.js';
import { SCREENS, showCard, showResults, showCrash } from './screens.js';
import { buildFx } from './fx.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot') || '';
const staging = shotName !== '';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('scene').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 5000);

const terrain = buildTerrain(scene);
const plane = buildPlane();
scene.add(plane.group);
const rings = buildRings(scene);
const canisters = buildCanisters(scene);
const fx = buildFx(scene);
const hud = buildHud();
const input = freshInput();
const state = freshState();

let screen = SCREENS.TITLE;
let announcedComplete = false;
let clock = 0;
let orbitAngle = 0.7;
let crashTimer = 0;
let burstTimer = 0;

showCard('title');

/** Advance the state machine on Space / Enter / click. */
function advanceScreen() {
  if (screen === SCREENS.TITLE) {
    screen = SCREENS.BRIEFING;
    showCard('briefing');
  } else if (screen === SCREENS.BRIEFING) {
    startFlying();
  }
}

function startFlying() {
  screen = SCREENS.FLYING;
  showCard(null);
  startAudio();
}

function resetRun() {
  Object.assign(state, freshState());
  resetRings(rings);
  resetCanisters(canisters);
  announcedComplete = false;
  screen = SCREENS.FLYING;
  showCard(null);
}

document.getElementById('fly-button').addEventListener('click', startFlying);
document.getElementById('again-button').addEventListener('click', resetRun);
document.getElementById('overlay').addEventListener('click', (event) => {
  if (event.target.id === 'fly-button' || event.target.id === 'again-button') return;
  advanceScreen();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') advanceScreen();
});

bindInput(input, renderer.domElement, () => {
  Object.assign(state, freshState());
  resetRings(rings);
  resetCanisters(canisters);
  showBanner(hud, 'RESET — BACK ON THE RUNWAY');
});

/** Chase camera: behind and above the plane, smoothed, plus mouse-look offset. */
function updateCamera(dt) {
  if (screen === SCREENS.TITLE || screen === SCREENS.BRIEFING) {
    // Slow orbit around the parked plane at sunset.
    if (!staging) orbitAngle += dt * 0.12;
    const radius = 20;
    const desired = new THREE.Vector3(
      state.pos.x + Math.sin(orbitAngle) * radius,
      state.pos.y + 5.5,
      state.pos.z + Math.cos(orbitAngle) * radius,
    );
    const k = 1 - Math.exp(-dt * 3);
    camera.position.lerp(desired, k);
    camera.lookAt(state.pos.x, state.pos.y + 1, state.pos.z);
    return;
  }
  const forward = forwardOf(state.heading);
  const back = 15;
  const height = 5;
  const desired = new THREE.Vector3(
    state.pos.x - forward.x * back,
    state.pos.y + height,
    state.pos.z - forward.z * back,
  );
  // Mouse drag orbits the view around the plane; it eases back on release.
  const lookYaw = input.lookYaw;
  const lookPitch = input.lookPitch;
  if (lookYaw !== 0 || lookPitch !== 0) {
    const cos = Math.cos(lookYaw);
    const sin = Math.sin(lookYaw);
    const ox = desired.x - state.pos.x;
    const oz = desired.z - state.pos.z;
    desired.x = state.pos.x + ox * cos - oz * sin;
    desired.z = state.pos.z + ox * sin + oz * cos;
    desired.y += lookPitch * 8;
  }
  const k = 1 - Math.exp(-dt * 5);
  camera.position.lerp(desired, k);
  const lookAt = new THREE.Vector3(
    state.pos.x + forward.x * 24,
    state.pos.y + 1.5,
    state.pos.z + forward.z * 24,
  );
  camera.lookAt(lookAt);
}

/** Handle one physics event: landing, crash, takeoff. */
function handleEvent(event) {
  if (event === 'takeoff') {
    showBanner(hud, 'AIRBORNE — GEAR UP, ISLANDS AHEAD');
  } else if (event === 'landed') {
    const grade = state.lastLanding || { grade: 'FIRM', bonus: 200 };
    state.score += grade.bonus;
    const restored = refuelAndRepair(state);
    if (grade.grade === 'HARD') {
      showBanner(hud, `HARD LANDING — DAMAGE ${state.damage}/3`, 'bad');
    } else {
      showBanner(hud, `${grade.grade}! +${grade.bonus}  ·  REFUELED +${restored.fuelAdded}%`, 'good');
    }
    playThud();
    if (missionComplete(rings)) {
      setTimeout(() => {
        // Only show results if the pilot is still parked on the runway.
        if (screen !== SCREENS.FLYING || !state.onGround) return;
        screen = SCREENS.LANDED;
        showResults(state);
      }, 1400);
    }
  } else if (event === 'hard-landing') {
    showBanner(hud, `HARD LANDING — DAMAGE ${state.damage}/3`, 'bad');
    playThud();
  } else if (event === 'crash') {
    screen = SCREENS.CRASHED;
    crashTimer = 3;
    showCrash(state, 3);
    playThud();
  }
}

function frame(dt) {
  clock += dt;
  if (screen === SCREENS.FLYING && !staging) {
    const event = stepFlight(state, input, dt);
    if (event) handleEvent(event);
    const ring = checkRingPass(rings, state.pos);
    if (ring) {
      const combo = comboFor(state.ringsFlown);
      state.score += combo.points;
      state.ringsFlown += 1;
      fx.spawnBurst(new THREE.Vector3(ring.def.x, ring.def.y, ring.def.z));
      const label = combo.multiplier > 1
        ? `RING ${state.ringsFlown}/8 — ${ring.def.label}  +${combo.points} x${combo.multiplier} COMBO`
        : `RING ${state.ringsFlown}/8 — ${ring.def.label}  +${combo.points}`;
      showBanner(hud, label, 'good');
      playRingChime();
      if (missionComplete(rings) && !announcedComplete) {
        announcedComplete = true;
        playMissionFanfare();
        setTimeout(() => showBanner(hud, `ALL 8 RINGS — LAND ON THE RUNWAY TO FINISH!`, 'good'), 2400);
      }
    }
    const can = checkCanisterPickup(canisters, state);
    if (can) {
      showBanner(hud, `FUEL CANISTER +45% — ${can.def.label}`, 'good');
      playRingChime();
    }
    setEngine(state.throttle, state.speed);
  }
  if (screen === SCREENS.CRASHED && !staging) {
    crashTimer -= dt;
    const left = Math.max(0, Math.ceil(crashTimer));
    showCrash(state, left);
    if (crashTimer <= 0) {
      respawnAtRunway(state);
      screen = SCREENS.FLYING;
      showCard(null);
      showBanner(hud, 'FRESH PLANE — BACK ON THE RUNWAY');
    }
  }
  if (staging && shotName === 'ringpass') {
    // Keep the burst alive for the screenshot: re-fire it as it fades.
    burstTimer += dt;
    if (burstTimer > 0.8) {
      burstTimer = 0;
      const ring = rings[3];
      ring.flash = 0.45;
      ring.torus.material.color.set(0xffffff);
      ring.group.scale.setScalar(1.3);
      fx.spawnBurst(new THREE.Vector3(ring.def.x, ring.def.y, ring.def.z));
    }
  }
  decayLook(input, dt);
  terrain.update(dt, clock);
  animateRings(rings, canisters, clock, dt);
  fx.update(dt, plane, state);
  posePlane(plane, state);
  animatePlane(plane, state, dt, clock);
  updateCamera(dt);
  updateHud(hud, state, rings, canisters);
  renderer.render(scene, camera);
}

/** Mark the first `count` rings as already flown (green), so staged shots stay consistent. */
function markFlown(count) {
  for (let i = 0; i < count && i < rings.length; i += 1) {
    rings[i].flown = true;
  }
  updateRingColors(rings);
}

/**
 * Screenshot scenes (?shot=...): stage the real game at a real moment, then render.
 * title — title card over the parked plane at sunset, camera orbiting.
 * ringpass — through the Lagoon ring with burst + combo banner.
 * landing — just touched down, BUTTER grade banner showing.
 * results — results card with time, rings, fuel, landing, score and GOLD medal.
 * cover/beach/runway/ring — the original staging scenes, kept for reference.
 */
function stageShot(name) {
  if (name === 'title') {
    screen = SCREENS.TITLE;
    showCard('title');
  } else if (name === 'ringpass') {
    screen = SCREENS.FLYING;
    showCard(null);
    const lagoon = RINGS[3];
    state.pos.set(lagoon.x + 30, lagoon.y, lagoon.z + 20);
    state.heading = Math.atan2(-(lagoon.x - state.pos.x), -(lagoon.z - state.pos.z));
    state.speed = 52;
    state.throttle = 0.85;
    state.fuel = 63;
    state.score = 1000;
    state.ringsFlown = 4;
    markFlown(4);
    rings[3].flash = 0.45;
    rings[3].torus.material.color.set(0xffffff);
    rings[3].group.scale.setScalar(1.3);
    fx.spawnBurst(new THREE.Vector3(lagoon.x, lagoon.y, lagoon.z));
    showBanner(hud, 'RING 4/8 — Lagoon  +400 x4 COMBO', 'good', 9000);
  } else if (name === 'landing') {
    screen = SCREENS.FLYING;
    showCard(null);
    state.pos.set(RUNWAY.x, RUNWAY.altitude + 1.6, RUNWAY.z + RUNWAY.length / 2 - 12);
    state.heading = 0;
    state.speed = 0;
    state.throttle = 0;
    state.fuel = 61;
    state.score = 3650;
    state.ringsFlown = 8;
    state.lastLanding = { grade: 'BUTTER', bonus: 500 };
    markFlown(8);
    showBanner(hud, 'BUTTER! +500  ·  REFUELED +39%', 'good', 9000);
  } else if (name === 'results') {
    screen = SCREENS.LANDED;
    state.pos.set(RUNWAY.x, RUNWAY.altitude + 1.6, RUNWAY.z + RUNWAY.length / 2 - 12);
    state.heading = 0;
    state.speed = 0;
    state.throttle = 0;
    state.fuel = 61;
    state.score = 3650;
    state.ringsFlown = 8;
    state.time = 272;
    state.damage = 0;
    state.lastLanding = { grade: 'BUTTER', bonus: 500 };
    markFlown(8);
    showResults(state);
  } else if (name === 'beach') {
    screen = SCREENS.FLYING;
    showCard(null);
    state.pos.set(-720, 30, -280);
    state.heading = -0.62;
    state.speed = 46;
    state.throttle = 0.75;
    state.fuel = 71;
    state.score = 100;
    state.ringsFlown = 1;
    markFlown(1);
  } else if (name === 'runway') {
    screen = SCREENS.FLYING;
    showCard(null);
    state.pos.set(RUNWAY.x, RUNWAY.altitude + 1.6, RUNWAY.z + RUNWAY.length / 2 - 12);
    state.heading = 0;
    state.speed = 0;
    state.throttle = 0;
    state.fuel = 100;
    state.score = 800;
    state.ringsFlown = 8;
    markFlown(8);
    showBanner(hud, 'LANDED — REFUELED +100% · REPAIRED', 'good', 9000);
  } else if (name === 'ring') {
    screen = SCREENS.FLYING;
    showCard(null);
    const lagoon = RINGS[3];
    state.pos.set(lagoon.x + 26, lagoon.y, lagoon.z + 18);
    state.heading = Math.atan2(-(lagoon.x - state.pos.x), -(lagoon.z - state.pos.z));
    state.speed = 52;
    state.throttle = 0.85;
    state.fuel = 63;
    state.score = 400;
    state.ringsFlown = 4;
    markFlown(4);
    showBanner(hud, 'RING 4/8 — Lagoon  +100', 'good', 9000);
  } else {
    // cover: Lagoon ring ahead-right, runway in the distance to the left.
    screen = SCREENS.FLYING;
    showCard(null);
    state.pos.set(280, 60, 280);
    state.heading = 0.25;
    state.speed = 50;
    state.throttle = 0.8;
    state.fuel = 82;
    state.score = 200;
    state.ringsFlown = 2;
    markFlown(2);
  }
  // Settle the chase camera behind the plane before the first presented frame.
  for (let i = 0; i < 40; i += 1) {
    updateCamera(1 / 30);
    posePlane(plane, state);
  }
  updateHud(hud, state, rings, canisters);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (shotName) {
  stageShot(shotName);
}

// Keep rendering so the water, smoke and rings keep their life in the frame.
let last = performance.now();
const loop = (now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

// Expose the live state for play-testing from the browser console.
window.__islandHopper = { state, rings, canisters, input, screen: () => screen, advanceScreen, startFlying };

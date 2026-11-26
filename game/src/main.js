// main.js — boot + game loop + chase camera + screenshot scenes.
// One clear job: wire every module together and run the game.

import * as THREE from 'three';
import { buildTerrain, RINGS, RUNWAY } from './terrain.js';
import { buildPlane, posePlane, animatePlane } from './plane.js';
import { freshState, stepFlight, respawnAtRunway, forwardOf } from './physics.js';
import { buildRings, checkRingPass, refuelAndRepair, missionComplete, nextRingLabel, animateRings, RING_SCORE } from './missions.js';
import { buildHud, updateHud, showBanner } from './hud.js';
import { freshInput, bindInput, decayLook } from './input.js';
import { startAudio, setEngine, playRingChime, playThud, playMissionFanfare } from './audio.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot') || '';

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
const hud = buildHud();
const input = freshInput();
const state = freshState();

let started = false;
let announcedComplete = false;
let clock = 0;

const overlay = document.getElementById('overlay');
const flyButton = document.getElementById('fly-button');

function startGame() {
  if (started) return;
  started = true;
  overlay.classList.add('hidden');
  startAudio();
}

flyButton.addEventListener('click', startGame);
window.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && !started) startGame();
});

bindInput(input, renderer.domElement, () => {
  Object.assign(state, freshState());
  showBanner(hud, 'RESET — BACK ON THE RUNWAY');
});

/** Chase camera: behind and above the plane, smoothed, plus mouse-look offset. */
function updateCamera(dt) {
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
    const restored = refuelAndRepair(state);
    showBanner(hud, `LANDED — REFUELED +${restored.fuelAdded}% · REPAIRED`, 'good');
    playThud();
  } else if (event === 'hard-landing') {
    showBanner(hud, `HARD LANDING — DAMAGE ${state.damage}/3`, 'bad');
    playThud();
  } else if (event === 'crash') {
    showBanner(hud, 'CRASHED — BACK TO THE RUNWAY (+30s)', 'bad');
    playThud();
    setTimeout(() => respawnAtRunway(state), 900);
  }
}

function frame(dt) {
  clock += dt;
  if (started && !shotName) {
    const event = stepFlight(state, input, dt);
    if (event) handleEvent(event);
    const ring = checkRingPass(rings, state.pos);
    if (ring) {
      state.score += RING_SCORE;
      state.ringsFlown += 1;
      showBanner(hud, `RING ${state.ringsFlown}/8 — ${ring.def.label}  +${RING_SCORE}`, 'good');
      playRingChime();
      if (missionComplete(rings) && !announcedComplete) {
        announcedComplete = true;
        playMissionFanfare();
        setTimeout(() => showBanner(hud, `MISSION COMPLETE — ALL 8 RINGS IN ${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}!`, 'good'), 2400);
      }
    }
    setEngine(state.throttle, state.speed);
  }
  decayLook(input, dt);
  terrain.update(dt, clock);
  animateRings(rings, clock);
  posePlane(plane, state);
  animatePlane(plane, state, dt, clock);
  updateCamera(dt);
  updateHud(hud, state, nextRingLabel(rings));
  renderer.render(scene, camera);
}

/** Mark the first `count` rings as already flown (green), so staged shots stay consistent. */
function markFlown(count) {
  for (let i = 0; i < count && i < rings.length; i += 1) {
    rings[i].flown = true;
    rings[i].torus.material.color.set(0x37d67a);
  }
}

/**
 * Screenshot scenes (?shot=...): stage the real game at a real moment, then render.
 * cover — chase view mid-flight, ring ahead, runway in the distance.
 * beach — low pass over the beach of Pulau Solmar.
 * runway — parked on the runway just after a landing (refuel banner showing).
 * ring — passing through the Lagoon ring with the score banner showing.
 */
function stageShot(name) {
  started = true;
  overlay.classList.add('hidden');
  if (name === 'beach') {
    state.pos.set(-720, 30, -280);
    state.heading = -0.62;
    state.speed = 46;
    state.throttle = 0.75;
    state.fuel = 71;
    state.score = 100;
    state.ringsFlown = 1;
    markFlown(1);
  } else if (name === 'runway') {
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
  updateHud(hud, state, nextRingLabel(rings));
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (shotName) {
  stageShot(shotName);
  // Keep rendering so the water, smoke and rings keep their life in the frame.
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
} else {
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// Expose the live state for play-testing from the browser console.
window.__islandHopper = { state, rings, input, startGame };

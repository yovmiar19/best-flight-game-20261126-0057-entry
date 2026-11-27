// main.js — Island Hopper v3: boot + loop + camera (§1.4) + state machine (§1.5)
// + staging ?shot=... (§5). Physics/input/pose are all imported; this file only
// wires them together exactly as the spec says.

import { freshState, respawnState, refuelAndRepair, stepPhysics, MAX_SPEED } from './physics.js';
import { groundHeightAt, overRunway, RINGS } from './terrain.js';
import { createTerrain } from './terrain.js';
import { createMissions, missionComplete } from './missions.js';
import { createPlane } from './plane.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createFx } from './fx.js';
import { createScreens } from './screens.js';

const THREE = window.THREE;

const world = { groundHeightAt, overRunway };

let state = freshState();
let screen = 'TITLE'; // TITLE -> BRIEFING -> FLYING -> CRASHED / LANDED
let orbitAngle = 0;
let crashCountdown = 0;
let resultsTimer = null;

const canvas = document.getElementById('game-canvas');
const loadingEl = document.getElementById('loading');
const noglEl = document.getElementById('nogl');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  if (noglEl) noglEl.style.display = 'flex';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 5000);
// FOV 62 FIXED — never changed anywhere in this file.

const terrain = createTerrain(scene);
const missions = createMissions(scene);
const plane = createPlane(scene);
const fx = createFx(scene);
const hud = createHud();
const audio = createAudio();
const screens = createScreens();
const input = createInput(canvas);

function updateCamera(dt) {
  if (screen === 'TITLE' || screen === 'BRIEFING') {
    // Slow orbit around the PARKED Tomcat (spec §1.4)
    orbitAngle += dt * 0.12;
    const desired = new THREE.Vector3(
      state.pos.x + Math.sin(orbitAngle) * 20,
      state.pos.y + 5.5,
      state.pos.z + Math.cos(orbitAngle) * 20,
    );
    const k = 1 - Math.exp(-dt * 3);
    camera.position.lerp(desired, k);
    camera.lookAt(state.pos.x, state.pos.y + 1, state.pos.z);
    return;
  }
  // FLYING / CRASHED / LANDED chase (spec §1.4): back 15, height 5, lookAt +24
  const forward = { x: -Math.sin(state.heading), z: -Math.cos(state.heading) };
  const desired = new THREE.Vector3(
    state.pos.x - forward.x * 15,
    state.pos.y + 5,
    state.pos.z - forward.z * 15,
  );
  // Mouse-look: ROTATE the desired camera position around the plane (v1)
  if (input.lookYaw !== 0 || input.lookPitch !== 0) {
    const off = desired.clone().sub(new THREE.Vector3(state.pos.x, state.pos.y, state.pos.z));
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), input.lookYaw);
    desired.copy(new THREE.Vector3(state.pos.x, state.pos.y, state.pos.z).add(off));
    desired.y += input.lookPitch * 8;
  }
  const k = 1 - Math.exp(-dt * 5);
  camera.position.lerp(desired, k);
  camera.lookAt(
    state.pos.x + forward.x * 24,
    state.pos.y + 1.5,
    state.pos.z + forward.z * 24,
  );
  // NO camera.rotateZ, NO fov change — ever.
}

function startFlying() {
  screen = 'FLYING';
  screens.showFlying();
  audio.start();
}

function advanceScreen() {
  if (screen === 'TITLE') { screen = 'BRIEFING'; screens.showBriefing(); }
  else if (screen === 'BRIEFING') startFlying();
}

function resetRun() {
  state = freshState();
  missions.reset();
  crashCountdown = 0;
  if (resultsTimer) { clearTimeout(resultsTimer); resultsTimer = null; }
  screen = 'FLYING';
  screens.showFlying();
  hud.showBanner('RESET — BACK ON THE RUNWAY');
}

function goTitle() {
  state = freshState();
  missions.reset();
  if (resultsTimer) { clearTimeout(resultsTimer); resultsTimer = null; }
  screen = 'TITLE';
  screens.showTitle();
}

input.onAdvance = () => {
  if (screen === 'TITLE' || screen === 'BRIEFING') advanceScreen();
};
input.onReset = () => {
  if (screen === 'FLYING' || screen === 'LANDED' || screen === 'CRASHED') resetRun();
};
input.onMute = () => hud.setMute(audio.toggleMute());

document.getElementById('fly-button')?.addEventListener('click', (e) => { e.stopPropagation(); startFlying(); });
document.getElementById('briefing-button')?.addEventListener('click', (e) => { e.stopPropagation(); startFlying(); });
document.getElementById('again-button')?.addEventListener('click', (e) => { e.stopPropagation(); resetRun(); });
document.getElementById('title-button')?.addEventListener('click', (e) => { e.stopPropagation(); goTitle(); });
document.getElementById('cards')?.addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  if (screen === 'TITLE' || screen === 'BRIEFING') advanceScreen();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function handleEvents(events) {
  for (const ev of events) {
    if (ev.type === 'takeoff') {
      hud.showBanner('AIRBORNE — GEAR UP, ISLANDS AHEAD');
      audio.takeoff();
    } else if (ev.type === 'landed') {
      const { grade, bonus } = ev.landing;
      state.score += bonus;
      if (grade === 'BUTTER' || grade === 'FIRM') {
        const { fuelAdded, repaired } = refuelAndRepair(state);
        hud.showBanner(`${grade}! +${bonus} · REFUELED +${Math.round(fuelAdded)}%${repaired ? ' · REPAIRED' : ''}`);
        audio.chirp();
      } else {
        hud.showBanner(`HARD LANDING — DAMAGE ${state.damage}/3`);
        audio.hardLanding();
      }
      if (missionComplete(state)) {
        if (resultsTimer) clearTimeout(resultsTimer);
        resultsTimer = setTimeout(() => {
          if (screen === 'FLYING' && state.onGround) {
            screen = 'LANDED';
            screens.showResults(state);
          }
        }, 1400);
      }
    } else if (ev.type === 'hard-landing') {
      hud.showBanner(`HARD LANDING — DAMAGE ${state.damage}/3`);
      audio.hardLanding();
    } else if (ev.type === 'crash') {
      screen = 'CRASHED';
      crashCountdown = 3;
      screens.showCrash();
      screens.setCrashCountdown(3);
      audio.crash();
    }
  }
}

// ---- Staging ?shot=... (spec §5) ----
function applyShot(shot) {
  const setBase = (o) => { Object.assign(state, o); };
  if (shot === 'title') {
    screen = 'TITLE';
    screens.showTitle();
  } else if (shot === 'ringpass') {
    // Heading computed from geometry: face ring 4 (Lagoon) from the staging spot.
    const r4 = RINGS[3];
    const ringHeading = Math.atan2(-(r4.x - 330), -(r4.z - 140));
    setBase({ pos: { x: 330, y: 45, z: 140 }, heading: ringHeading, speed: 52, throttle: 0.85, fuel: 63, score: 1000, ringsFlown: 4, onGround: false, vy: 0 });
    screen = 'FLYING';
    screens.showFlying();
    const r = RINGS[3];
    fx.fireBurst(new THREE.Vector3(r.x, r.y, r.z));
    hud.showBanner('RING 4/8 — Lagoon +400 x4 COMBO', 60000);
    hud.showPopup('+400 ×4 COMBO', 60000);
  } else if (shot === 'landing') {
    setBase({ pos: { x: 0, y: 9.6, z: 158 }, heading: 0, speed: 0, throttle: 0, fuel: 61, score: 3650, ringsFlown: 8, onGround: true, lastLanding: { grade: 'BUTTER', bonus: 500 } });
    screen = 'FLYING';
    screens.showFlying();
    hud.showBanner('BUTTER! +500 · REFUELED +39%', 60000);
  } else if (shot === 'results') {
    setBase({ pos: { x: 0, y: 9.6, z: 158 }, heading: 0, speed: 0, throttle: 0, fuel: 61, score: 3650, ringsFlown: 8, time: 272, damage: 0, onGround: true, lastLanding: { grade: 'BUTTER', bonus: 500 } });
    screen = 'LANDED';
    screens.showResults(state);
  } else if (shot === 'beach') {
    setBase({ pos: { x: -720, y: 30, z: -280 }, heading: -0.62, speed: 46, throttle: 0.75, onGround: false, vy: 0 });
    screen = 'FLYING';
    screens.showFlying();
  } else if (shot === 'runway') {
    setBase({ pos: { x: 0, y: 9.6, z: 158 }, heading: 0, speed: 0, throttle: 0, fuel: 61, score: 800, ringsFlown: 8, onGround: true });
    screen = 'FLYING';
    screens.showFlying();
    hud.showBanner('LANDED — REFUELED +100% · REPAIRED', 60000);
  } else if (shot === 'ring') {
    const r4 = RINGS[3];
    const ringHeading = Math.atan2(-(r4.x - 330), -(r4.z - 140));
    setBase({ pos: { x: 330, y: 45, z: 140 }, heading: ringHeading, speed: 52, throttle: 0.85, fuel: 63, score: 1000, ringsFlown: 4, onGround: false, vy: 0 });
    screen = 'FLYING';
    screens.showFlying();
    hud.showBanner('RING 4/8 — Lagoon +100', 60000);
  } else if (shot === 'cover') {
    setBase({ pos: { x: 280, y: 60, z: 280 }, heading: 0.25, speed: 50, throttle: 0.8, onGround: false, vy: 0 });
    screen = 'FLYING';
    screens.showFlying();
  }
  // Settle the camera before the first frame (spec §5)
  for (let i = 0; i < 40; i++) { updateCamera(1 / 30); plane.pose(state); }
}

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) applyShot(shot);
else screens.showTitle();

// Playtest / debug hook (read-only state exposure for automated checks)
window.__game = {
  get state() { return state; },
  get screen() { return screen; },
  get maxSpeed() { return MAX_SPEED; },
  input, missions,
  resetRun, startFlying,
};

input.attach();
hud.setMute(false);

let lastT = performance.now();
let elapsed = 0;
let firstFrame = true;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  elapsed += dt;

  input.update(dt);

  if (screen === 'FLYING') {
    const events = stepPhysics(state, input, dt, world);
    handleEvents(events);
    // Rings + canisters only while flying
    if (screen === 'FLYING') {
      const ring = missions.checkRing(state);
      if (ring) {
        hud.showBanner(`RING ${ring.n}/8 — ${ring.label} +${ring.points}${ring.n > 1 ? ` x${ring.n} COMBO` : ''}`);
        hud.showPopup(`+${ring.points} ×${ring.n} COMBO`);
        const r = RINGS[ring.n - 1];
        fx.fireBurst(new THREE.Vector3(r.x, r.y, r.z));
        audio.ring(ring.n);
        if (missionComplete(state)) hud.showBanner('ALL 8 RINGS — LAND ON THE RUNWAY TO FINISH!');
      }
      const can = missions.checkCanister(state);
      if (can) {
        hud.showBanner(`FUEL CANISTER +45% — ${can.label}`);
        audio.canister();
      }
    }
  } else if (screen === 'CRASHED') {
    crashCountdown -= dt;
    screens.setCrashCountdown(Math.max(0, crashCountdown));
    if (crashCountdown <= 0) {
      // Respawn ON THE RUNWAY, keeping score / rings / time (spec §1.2)
      state = respawnState(state);
      screen = 'FLYING';
      screens.showFlying();
      hud.showBanner('FRESH PLANE — BACK ON THE RUNWAY');
    }
  }

  plane.pose(state);
  plane.animate(state, dt, elapsed);
  missions.update(state, dt, elapsed);
  terrain.update(dt, elapsed, state.pos);
  fx.update(state, plane, camera, dt, elapsed);
  audio.update(state, dt);
  updateCamera(dt);
  hud.update(state, camera, screen);

  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

requestAnimationFrame(loop);

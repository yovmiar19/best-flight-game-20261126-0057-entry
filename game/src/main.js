// main.js — Island Hopper entrypoint: renderer, camera, game loop, staging.
// Fresh write from polish-spec.md §4–§6, §11–§13.
import * as THREE from 'three';
import { buildTerrain, animateTerrain, groundHeightAt, RUNWAY } from './terrain.js';
import { buildPlane, posePlane, animatePlane, MAX_SPEED } from './plane.js';
import { createState, resetToRunway, respawnInAir, stepPhysics, headingToRing } from './physics.js';
import { buildRings, buildCanisters, animateRings, animateCanisters, flashRing } from './missions.js';
import { createAudio } from './audio.js';
import { createBursts, createContrails, createWindStreaks } from './fx.js';
import { createHud, updateHud, showBanner } from './hud.js';
import { createInput } from './input.js';
import { createScreens, SCREENS } from './screens.js';

const params = new URLSearchParams(location.search);
const shot = params.get('shot') || '';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.id = 'scene';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 8000);
camera.position.set(0, 70, 230);

const world = buildTerrain(scene);
const plane = buildPlane();
scene.add(plane.group);
const rings = buildRings(scene);
const canisters = buildCanisters(scene);
const bursts = createBursts(scene);
const contrails = createContrails(scene);
const streaks = createWindStreaks(scene);
const audio = createAudio();
const hud = createHud(document);

let state = createState(rings[0]);
let fovPunch = 0;

function nextRing() { return rings[state.ringsFlown] || null; }

function handleEvents(events) {
  for (const ev of events) {
    if (ev.type === 'ring') {
      const ring = rings[ev.index];
      flashRing(ring);
      bursts.burst(ring.pos, 0xffd700);
      audio.chime(ev.combo);
      fovPunch = 0.25;
      showBanner(hud, '+' + (100 * ev.combo) + ' ×' + ev.combo + ' COMBO', 1600);
    } else if (ev.type === 'canister') {
      bursts.burst(state.pos, 0xffb020);
      audio.chime(1);
      showBanner(hud, '+45% FUEL', 1400);
    } else if (ev.type === 'takeoff') {
      showBanner(hud, 'AIRBORNE!', 1200);
    } else if (ev.type === 'land') {
      if (ev.grade === 'BUTTER') { audio.chirp(); showBanner(hud, 'BUTTER LANDING! +500', 2000); }
      else if (ev.grade === 'FIRM') { audio.chirp(); showBanner(hud, 'FIRM LANDING +200', 1800); }
      else { audio.thud(); showBanner(hud, 'HARD LANDING — DAMAGE +1', 1800); }
    } else if (ev.type === 'finish') {
      audio.fanfare();
      screens.toLanded(state);
    } else if (ev.type === 'crash') {
      audio.thud();
      const hits = state.damage;
      if (state.damage >= 3) {
        // Total loss: airframe written off, damage resets, score kept.
        state.damage = 0;
      }
      screens.toCrashed(ev.reason, hits);
    }
  }
}

const screens = createScreens(document, {
  onTitle() { /* attract mode runs in the loop */ },
  onBriefing() { audio.unlock(); },
  onFly(prev) {
    audio.unlock();
    // Fresh start from TITLE/BRIEFING: reset to the air-start state so the
    // player always takes control at altitude 55, speed 45, facing ring 1 —
    // never with attract mode's leftover heading/roll.
    if (prev === SCREENS.TITLE || prev === SCREENS.BRIEFING) {
      state = createState(rings[0]);
      contrails.reset();
    }
  },
  onCrash() { /* countdown handled in loop */ },
  onRespawn() {
    respawnInAir(state, nextRing());
    contrails.reset();
    showBanner(hud, 'BACK IN THE AIR — INVULNERABLE 2 s', 1600);
  },
  onFinish() { /* results card shown by screens.js */ },
});

const input = createInput(document, {
  onMute() {
    audio.unlock();
    const muted = audio.toggleMute();
    if (hud.mute) hud.mute.textContent = muted ? 'M — SOUND OFF' : 'M — SOUND ON';
  },
  onReset() {
    if (screens.screen === SCREENS.LANDED) { restartRun(); return; }
    if (screens.screen !== SCREENS.FLYING) return;
    resetToRunway(state);
    contrails.reset();
    showBanner(hud, 'RESET — ON THE RUNWAY', 1400);
  },
  onAdvance() {
    audio.unlock();
    screens.advance();
  },
});

function restartRun() {
  for (const r of rings) r.passed = false;
  for (const c of canisters) c.taken = false;
  state = createState(rings[0]);
  contrails.reset();
  screens.toFlying();
  showBanner(hud, 'FLY AGAIN — GOOD LUCK!', 1500);
}

// Click / tap anywhere advances screens (TITLE -> BRIEFING -> FLYING).
document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  if (screens.screen === SCREENS.TITLE || screens.screen === SCREENS.BRIEFING) {
    audio.unlock();
    screens.advance();
  }
});
document.getElementById('btn-fly').addEventListener('click', () => { audio.unlock(); screens.toFlying(); });
document.getElementById('btn-again').addEventListener('click', () => { audio.unlock(); restartRun(); });
document.getElementById('btn-title').addEventListener('click', () => { audio.unlock(); screens.toTitle(); });

// ---- Staging scenes (?shot=) ----
function applyShot() {
  if (!shot) return;
  if (shot === 'tomcat') {
    // Tomcat close-up: parked on the runway centre, wings extended (20°).
    resetToRunway(state);
    state.pos.set(RUNWAY.x, RUNWAY.alt + 1.2, RUNWAY.z);
    state.speed = 0; state.throttle = 0;
    screens.screen = SCREENS.FLYING;
    document.getElementById('overlay').style.display = 'none';
  } else if (shot === 'scenic') {
    state.pos.set(280, 180, 280);
    state.heading = 0.25; state.speed = 50; state.throttle = 0.8;
    state.onGround = false;
    screens.screen = SCREENS.FLYING;
    document.getElementById('overlay').style.display = 'none';
  } else if (shot === 'results') {
    state.ringsFlown = 8;
    for (const r of rings) r.passed = true;
    state.score = 3400; state.time = 245; state.fuel = 62; state.grade = 'BUTTER'; state.damage = 0;
    screens.toLanded(state);
  } else if (shot === 'ringpass' || shot === 'ring') {
    state.pos.set(-180, 55, -200);
    state.heading = headingToRing(state.pos, rings[0]);
    state.speed = 45; state.throttle = 0.7;
    screens.screen = SCREENS.FLYING;
    document.getElementById('overlay').style.display = 'none';
  } else if (shot === 'landing') {
    state.pos.set(0, 40, 320);
    state.heading = 0; state.speed = 30; state.throttle = 0.4; state.onGround = false;
    screens.screen = SCREENS.FLYING;
    document.getElementById('overlay').style.display = 'none';
  } else if (shot === 'title' || shot === 'cover' || shot === 'beach' || shot === 'runway') {
    screens.toTitle();
    if (shot === 'runway') {
      resetToRunway(state);
      state.pos.set(RUNWAY.x, RUNWAY.alt + 1.2, RUNWAY.z + 40);
    }
  }
}
applyShot();

// ---- Debug handle for play-testing ----
window.__islandHopper = {
  get state() { return state; }, rings, canisters, input, plane,
  get screen() { return screens.screen; },
  advanceScreen: () => screens.advance(),
  startFlying: () => screens.toFlying(),
  restart: restartRun,
};

// ---- Camera ----
const camPos = new THREE.Vector3(0, 70, 230);
let orbitAngle = 2.6; // start front-right 3/4 so the Tomcat reads in the first frame

function updateCamera(dt, t) {
  const fwd = new THREE.Vector3(
    Math.sin(state.heading) * Math.cos(state.pitch),
    Math.sin(state.pitch),
    -Math.cos(state.heading) * Math.cos(state.pitch)
  );
  let desired;
  if (shot === 'tomcat') {
    // Close orbit camera around the parked Tomcat, wings extended.
    orbitAngle += dt * 0.25;
    desired = new THREE.Vector3(
      state.pos.x + Math.sin(orbitAngle) * 14,
      state.pos.y + 4 + Math.sin(t * 0.3) * 1,
      state.pos.z + Math.cos(orbitAngle) * 14
    );
    camPos.lerp(desired, Math.min(1, 5 * dt));
    camera.position.copy(camPos);
    camera.lookAt(state.pos.x, state.pos.y + 0.5, state.pos.z);
    camera.fov = 55;
    camera.updateProjectionMatrix();
    return;
  }
  if (screens.screen === SCREENS.TITLE) {
    // Attract mode: slow orbit around the self-flying Tomcat.
    // Look slightly above the plane so it sits below the centred title card.
    orbitAngle += dt * 0.12;
    desired = new THREE.Vector3(
      state.pos.x + Math.sin(orbitAngle) * 30,
      state.pos.y + 9,
      state.pos.z + Math.cos(orbitAngle) * 30
    );
    camPos.lerp(desired, Math.min(1, 2.5 * dt));
    camera.position.copy(camPos);
    camera.lookAt(state.pos.x, state.pos.y + 4, state.pos.z);
    camera.fov = 62;
    camera.updateProjectionMatrix();
    return;
  }
  // Chase camera: behind + above, spring-damped.
  const back = 14, up = 4.5;
  desired = state.pos.clone()
    .addScaledVector(fwd, -back)
    .add(new THREE.Vector3(0, up, 0));
  // Mouse-drag look offset
  desired.add(new THREE.Vector3(
    Math.cos(state.heading) * input.lookX * 6,
    input.lookY * 4,
    Math.sin(state.heading) * input.lookX * 6
  ));
  camPos.lerp(desired, Math.min(1, 5 * dt));
  camera.position.copy(camPos);
  const lookTarget = state.pos.clone().addScaledVector(fwd, 12);
  lookTarget.y += input.lookY * 6;
  camera.lookAt(lookTarget);
  // Camera rolls ~30% with the plane's roll.
  camera.rotateZ(state.roll * 0.3);
  // FOV 60° idle -> 75° full throttle, +6° punch on ring pass.
  if (fovPunch > 0) fovPunch -= dt;
  const baseFov = 60 + 15 * (state.speed / MAX_SPEED);
  camera.fov = baseFov + (fovPunch > 0 ? 6 * (fovPunch / 0.25) : 0);
  camera.updateProjectionMatrix();
  // Look offsets decay.
  input.lookX *= Math.max(0, 1 - 2 * dt);
  input.lookY *= Math.max(0, 1 - 2 * dt);
}

// ---- Main loop ----
const clock = new THREE.Clock();
let fpsFrames = 0, fpsTime = 0;
let shadowsOk = true;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  input.pollGamepad();

  if (screens.screen === SCREENS.TITLE) {
    screens.attractStep(state, dt);
  } else if (screens.screen === SCREENS.FLYING) {
    const events = stepPhysics(state, input, dt, { rings, canisters });
    handleEvents(events);
  } else if (screens.screen === SCREENS.CRASHED) {
    screens.tickCrash(dt);
  }

  posePlane(plane, state);
  animatePlane(plane, state, dt, t);
  animateTerrain(world, t, dt);
  animateRings(rings, state.ringsFlown, t, dt);
  animateCanisters(canisters, t);
  bursts.update(dt);
  contrails.update(plane.group, state.speed);
  streaks.update(camera, state.speed, dt);
  audio.update(state.throttle, state.speed, MAX_SPEED);

  // Sun shadow camera follows the plane.
  if (world.sunLight) {
    world.sunLight.position.set(state.pos.x - 900, 260, state.pos.z - 700);
    world.sunLight.target.position.set(state.pos.x, 0, state.pos.z);
    world.sunLight.target.updateMatrixWorld();
  }

  updateCamera(dt, t);
  updateHud(hud, state, rings, canisters, nextRing(), dt);

  // FPS guard: if shadows tank the frame rate, drop them (documented fallback).
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 2 && shadowsOk) {
    const fps = fpsFrames / fpsTime;
    if (fps < 30 && renderer.shadowMap.enabled) {
      renderer.shadowMap.enabled = false;
      shadowsOk = false;
      console.warn('[island-hopper] shadows disabled, fps was ' + fps.toFixed(1));
    }
    fpsFrames = 0; fpsTime = 0;
  }

  renderer.render(scene, camera);
}
tick();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

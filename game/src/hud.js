// hud.js — the instrument overlay: altitude, speed, heading, fuel, score, mission,
// next-ring guidance arrow + distance, and a corner minimap.
// One clear job: turn flight state into DOM text, and flash banners.

import { ISLANDS, RINGS, RUNWAY } from './terrain.js';

const $ = (id) => document.getElementById(id);

function compass(heading) {
  const deg = ((Math.round((-heading * 180) / Math.PI) % 360) + 360) % 360;
  return String(deg).padStart(3, '0');
}

/** Bearing from the plane to a target, in the same convention as heading (0 = north). */
function bearingTo(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Build the HUD elements inside #hud and return handles. */
export function buildHud() {
  const hud = $('hud');
  hud.innerHTML = `
    <div class="panel" id="hud-left">
      <div class="row"><span>ALT</span><b id="hud-alt">0 m</b></div>
      <div class="row"><span>SPD</span><b id="hud-spd">0 km/h</b></div>
      <div class="row"><span>HDG</span><b id="hud-hdg">000°</b></div>
      <div class="row"><span>THR</span><div class="bar"><i id="hud-thr"></i></div></div>
      <div class="row"><span>FUEL</span><div class="bar fuel"><i id="hud-fuel"></i></div></div>
    </div>
    <div class="panel" id="hud-right">
      <div class="row"><span>SCORE</span><b id="hud-score">0</b></div>
      <div class="row"><span>COMBO</span><b id="hud-combo">x1</b></div>
      <div class="row"><span>RINGS</span><b id="hud-rings">0 / 8</b></div>
      <div class="row"><span>TIME</span><b id="hud-time">0:00</b></div>
      <div class="row"><span>DMG</span><b id="hud-dmg">▢▢▢</b></div>
    </div>
    <div id="hud-mission">Fly through all 8 glowing rings, then land on the runway.</div>
    <div id="hud-guide"><span id="hud-arrow">➤</span><span id="hud-guide-text"></span></div>
    <div id="hud-warn"></div>
    <div id="hud-banner"></div>
    <canvas id="hud-minimap" width="150" height="150"></canvas>
  `;
  return {
    alt: $('hud-alt'),
    spd: $('hud-spd'),
    hdg: $('hud-hdg'),
    thr: $('hud-thr'),
    fuel: $('hud-fuel'),
    score: $('hud-score'),
    combo: $('hud-combo'),
    rings: $('hud-rings'),
    time: $('hud-time'),
    dmg: $('hud-dmg'),
    mission: $('hud-mission'),
    guide: $('hud-guide'),
    arrow: $('hud-arrow'),
    guideText: $('hud-guide-text'),
    warn: $('hud-warn'),
    banner: $('hud-banner'),
    minimap: $('hud-minimap'),
  };
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Draw the minimap: islands, runway, rings (gold next, cyan pending, green flown), plane. */
function drawMinimap(canvas, state, rings, canisters) {
  const ctx = canvas.getContext('2d');
  const S = 150 / 3000; // world 3000 m across -> 150 px
  const toX = (x) => 75 + x * S;
  const toY = (z) => 75 + z * S;
  ctx.clearRect(0, 0, 150, 150);
  ctx.fillStyle = 'rgba(8, 24, 40, 0.55)';
  ctx.beginPath();
  ctx.roundRect(0, 0, 150, 150, 10);
  ctx.fill();
  for (const island of ISLANDS) {
    ctx.fillStyle = '#4caf50';
    ctx.beginPath();
    ctx.arc(toX(island.x), toY(island.z), Math.max(3, island.radius * S), 0, Math.PI * 2);
    ctx.fill();
  }
  // Runway.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(toX(RUNWAY.x), toY(RUNWAY.z - RUNWAY.length / 2));
  ctx.lineTo(toX(RUNWAY.x), toY(RUNWAY.z + RUNWAY.length / 2));
  ctx.stroke();
  // Fuel canisters (amber squares, hidden once taken).
  for (const can of canisters) {
    if (can.taken) continue;
    ctx.fillStyle = '#ffb300';
    ctx.fillRect(toX(can.def.x) - 3, toY(can.def.z) - 3, 6, 6);
  }
  // Rings: gold = next, cyan = pending, green = flown.
  const next = rings.find((ring) => !ring.flown);
  for (const ring of rings) {
    ctx.fillStyle = ring.flown ? '#37d67a' : (ring === next ? '#ffb300' : '#2a9d8f');
    ctx.beginPath();
    ctx.arc(toX(ring.def.x), toY(ring.def.z), ring === next ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Plane: white triangle pointing along the heading (up = north).
  ctx.save();
  ctx.translate(toX(state.pos.x), toY(state.pos.z));
  ctx.rotate(-state.heading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Refresh every HUD field from the flight state. Cheap: only writes when changed. */
export function updateHud(handles, state, rings, canisters) {
  const alt = Math.max(0, Math.round(state.pos.y));
  const spd = Math.round(state.speed * 3.6);
  const hdg = compass(state.heading);
  const time = formatTime(state.time);
  const dmg = '▣'.repeat(state.damage) + '▢'.repeat(Math.max(0, 3 - state.damage));
  const set = (el, value) => {
    if (el.textContent !== value) el.textContent = value;
  };
  set(handles.alt, `${alt} m`);
  set(handles.spd, `${spd} km/h`);
  set(handles.hdg, `${hdg}°`);
  set(handles.score, String(state.score));
  set(handles.combo, `x${Math.min(state.ringsFlown + 1, 8)}`);
  set(handles.rings, `${state.ringsFlown} / 8`);
  set(handles.time, time);
  set(handles.dmg, dmg);
  handles.thr.style.width = `${Math.round(state.throttle * 100)}%`;
  handles.fuel.style.width = `${Math.round(state.fuel)}%`;
  handles.fuel.parentElement.classList.toggle('low', state.fuel < 25);

  const warnings = [];
  if (state.stalled) warnings.push('⚠ STALL — NOSE DOWN, ADD THROTTLE');
  if (state.fuel < 25 && state.fuel > 0) warnings.push('⚠ LOW FUEL — LAND ON THE RUNWAY');
  if (state.fuel === 0) warnings.push('⚠ FUEL EMPTY — GLIDING');
  if (state.damage > 0) warnings.push(`⚠ DAMAGE ${state.damage}/3 — LAND TO REPAIR`);
  set(handles.warn, warnings.join('  ·  '));
  handles.warn.style.display = warnings.length ? 'block' : 'none';

  const next = rings.find((ring) => !ring.flown);
  if (next) {
    const dist = Math.round(Math.hypot(next.def.x - state.pos.x, next.def.z - state.pos.z));
    const rel = normAngle(bearingTo(state.pos, next.def) - state.heading);
    handles.arrow.style.transform = `rotate(${rel}rad)`;
    set(handles.guideText, `Ring ${next.group.userData.index + 1} — ${dist} m`);
    set(handles.mission, `Next ring: Ring ${next.group.userData.index + 1} — ${next.def.label}  ·  ${state.ringsFlown} of 8 flown`);
    handles.guide.style.display = 'block';
  } else {
    handles.guide.style.display = 'none';
    set(handles.mission, `MISSION COMPLETE — all 8 rings in ${time}! Land on the runway to finish.`);
  }

  drawMinimap(handles.minimap, state, rings, canisters);
}

/** Show a big centre banner for a few seconds (longer in staged screenshot scenes). */
export function showBanner(handles, text, kind = '', durationMs = 2600) {
  handles.banner.textContent = text;
  handles.banner.className = `show ${kind}`;
  clearTimeout(showBanner.timer);
  showBanner.timer = setTimeout(() => {
    handles.banner.className = '';
  }, durationMs);
}
showBanner.timer = 0;

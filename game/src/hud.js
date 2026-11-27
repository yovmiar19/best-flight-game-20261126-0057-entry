// hud.js — Trimmed HUD (spec §8): big SPD + ALT (left), fuel bar (left),
// SCORE + RINGS n/8 + TIME (right). Damage = smoke + red vignette, no DMG number.
// Guide arrow + distance, warnings, objective line, 150 px minimap.
import { ISLANDS } from './terrain.js';
import { fmtTime } from './missions.js';

export function createHud(doc) {
  const el = (id) => doc.getElementById(id);
  const h = {
    spd: el('hud-spd'), alt: el('hud-alt'), fuelFill: el('hud-fuel-fill'),
    score: el('hud-score'), rings: el('hud-rings'), time: el('hud-time'),
    objective: el('hud-objective'), guide: el('hud-guide-arrow'), guideDist: el('hud-guide-dist'),
    warn: el('hud-warn'), vignette: el('hud-vignette'), mute: el('hud-mute'),
    banner: el('hud-banner'), minimap: el('hud-minimap'),
    bannerTimer: 0,
  };
  h.mapCtx = h.minimap ? h.minimap.getContext('2d') : null;
  return h;
}

export function showBanner(h, text, ms) {
  if (!h.banner) return;
  h.banner.textContent = text;
  h.banner.classList.add('show');
  h.bannerTimer = (ms || 1800) / 1000;
}

export function updateHud(h, state, rings, canisters, nextRing, dt) {
  if (h.bannerTimer > 0) {
    h.bannerTimer -= dt;
    if (h.bannerTimer <= 0) h.banner.classList.remove('show');
  }
  if (h.spd) h.spd.textContent = Math.round(state.speed * 3.6) + ' km/h';
  if (h.alt) h.alt.textContent = Math.round(state.pos.y) + ' m';
  if (h.fuelFill) {
    h.fuelFill.style.width = Math.max(0, state.fuel) + '%';
    h.fuelFill.className = 'fill' + (state.fuel < 25 ? ' low' : '');
  }
  if (h.score) h.score.textContent = 'SCORE ' + state.score;
  if (h.rings) h.rings.textContent = 'RINGS ' + state.ringsFlown + '/8';
  if (h.time) h.time.textContent = 'TIME ' + fmtTime(state.time);

  // Objective line
  if (h.objective) {
    if (state.ringsFlown >= 8) h.objective.textContent = 'Land on Karimbu to finish';
    else if (nextRing) h.objective.textContent = 'Next: Ring ' + (state.ringsFlown + 1) + ' — ' + nextRing.def.label;
    else h.objective.textContent = 'Fly through 8 rings in order, then land on Karimbu';
  }

  // Guide arrow + distance to next ring
  if (nextRing && h.guide) {
    const dx = nextRing.pos.x - state.pos.x;
    const dz = nextRing.pos.z - state.pos.z;
    const targetHeading = Math.atan2(dx, -dz);
    let rel = targetHeading - state.heading;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    // Arrow glyph ➤ points right (east); up = straight ahead, so offset -90°.
    h.guide.style.transform = 'rotate(' + (rel * 180 / Math.PI - 90) + 'deg)';
    h.guide.style.opacity = '1';
    if (h.guideDist) {
      const d = Math.hypot(dx, dz);
      const dy = nextRing.pos.y - state.pos.y;
      const arrow = dy > 8 ? ' ▲' : dy < -8 ? ' ▼' : '';
      h.guideDist.textContent = Math.round(Math.hypot(d, dy)) + ' m' + arrow;
    }
  } else if (h.guide) {
    h.guide.style.opacity = '0.25';
    if (h.guideDist) h.guideDist.textContent = '';
  }

  // Warnings
  let warn = '';
  if (state.fuel <= 0) warn = 'FUEL EMPTY — GLIDING!';
  else if (state.fuel < 20) warn = 'LOW FUEL';
  else if (state.stallWarn) warn = 'STALL!';
  else if (state.damage >= 2) warn = 'DAMAGE — FLY CAREFULLY';
  if (h.warn) {
    h.warn.textContent = warn;
    h.warn.style.display = warn ? 'block' : 'none';
  }

  // Damage vignette (red screen edge, opacity scales with damage)
  if (h.vignette) h.vignette.style.opacity = String(state.damage * 0.3);

  drawMinimap(h, state, rings, canisters);
}

function drawMinimap(h, state, rings, canisters) {
  const ctx = h.mapCtx;
  if (!ctx) return;
  const W = 150, S = W / 3000; // world radius 1500 -> 150 px
  ctx.clearRect(0, 0, W, W);
  ctx.fillStyle = 'rgba(10,30,50,0.75)';
  ctx.fillRect(0, 0, W, W);
  const px = (x) => W / 2 + x * S;
  const pz = (z) => W / 2 + z * S;
  // Islands
  ctx.fillStyle = '#3f7d3f';
  for (const isl of ISLANDS) {
    ctx.beginPath();
    ctx.arc(px(isl.x), pz(isl.z), Math.max(2, isl.r * S), 0, Math.PI * 2);
    ctx.fill();
  }
  // Runway
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px(0), pz(60 - 110));
  ctx.lineTo(px(0), pz(60 + 110));
  ctx.stroke();
  // Canisters
  ctx.fillStyle = '#ffb020';
  for (const c of canisters) {
    if (c.taken) continue;
    ctx.beginPath();
    ctx.arc(px(c.pos.x), pz(c.pos.z), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Rings: gold next / dim cyan / green flown
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    ctx.fillStyle = r.passed ? '#22c55e' : i === state.ringsFlown ? '#ffd700' : '#1a7f8e';
    ctx.beginPath();
    ctx.arc(px(r.pos.x), pz(r.pos.z), i === state.ringsFlown ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Plane triangle pointing along heading
  const hx = Math.sin(state.heading), hz = -Math.cos(state.heading);
  const cx = px(state.pos.x), cy = pz(state.pos.z);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx + hx * 7, cy + hz * 7);
  ctx.lineTo(cx - hz * 4 - hx * 4, cy + hx * 4 - hz * 4);
  ctx.lineTo(cx + hz * 4 - hx * 4, cy - hx * 4 - hz * 4);
  ctx.closePath();
  ctx.fill();
}

// hud.js — Island Hopper v3: HUD, spec §2.3 (display only).
// Left: SPD + ALT + fuel. Right: SCORE / RINGS / TIME. Objective line top-centre.
// Edge arrow + distance to next ring. Damage = smoke + red vignette, never a number.

import { RINGS } from './terrain.js';

const THREE = window.THREE;

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    spd: $('hud-spd'), alt: $('hud-alt'), fuelFill: $('hud-fuel-fill'), fuelText: $('hud-fuel-text'),
    score: $('hud-score'), rings: $('hud-rings'), time: $('hud-time'),
    objective: $('hud-objective'), arrow: $('hud-arrow'), ringDist: $('hud-ring-dist'),
    popup: $('hud-popup'), banner: $('hud-banner'), vignette: $('hud-vignette'),
    mute: $('hud-mute'), minimap: $('hud-minimap'), stall: $('hud-stall'),
  };
  let bannerTimer = null;
  let popupTimer = null;

  function fmtTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  return {
    showBanner(text, ms = 2600) {
      if (!el.banner) return;
      el.banner.textContent = text;
      el.banner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => el.banner.classList.remove('show'), ms);
    },
    showPopup(text, ms = 1400) {
      if (!el.popup) return;
      el.popup.textContent = text;
      el.popup.classList.add('show');
      clearTimeout(popupTimer);
      popupTimer = setTimeout(() => el.popup.classList.remove('show'), ms);
    },
    setMute(muted) {
      if (el.mute) el.mute.textContent = muted ? 'M — SOUND OFF' : 'M — SOUND ON';
    },
    update(state, camera, screen) {
      const inFlight = screen === 'FLYING' || screen === 'CRASHED' || screen === 'LANDED';
      if (el.spd) el.spd.textContent = `${Math.round(state.speed * 3.6)}`;
      if (el.alt) el.alt.textContent = `${Math.max(0, Math.round(state.pos.y))}`;
      if (el.fuelFill) {
        el.fuelFill.style.width = `${Math.max(0, state.fuel)}%`;
        el.fuelFill.classList.toggle('low', state.fuel < 25);
      }
      if (el.fuelText) el.fuelText.textContent = `${Math.round(state.fuel)}%`;
      if (el.score) el.score.textContent = String(state.score);
      if (el.rings) el.rings.textContent = `${state.ringsFlown}/8`;
      if (el.time) el.time.textContent = fmtTime(state.time);
      if (el.stall) el.stall.style.display = state.stalled ? 'block' : 'none';

      // Objective line
      if (el.objective) {
        if (state.ringsFlown >= 8) el.objective.textContent = 'Land on Karimbu to finish';
        else {
          const r = RINGS[state.ringsFlown];
          el.objective.textContent = `Next: Ring ${state.ringsFlown + 1} — ${r.label}`;
        }
      }

      // Edge arrow + distance to next ring
      if (state.ringsFlown < 8 && el.arrow && camera) {
        const r = RINGS[state.ringsFlown];
        const d = Math.hypot(state.pos.x - r.x, state.pos.y - r.y, state.pos.z - r.z);
        if (el.ringDist) el.ringDist.textContent = `${Math.round(d)} m`;
        const v = new THREE.Vector3(r.x, r.y, r.z).project(camera);
        const onScreen = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
        if (onScreen) {
          el.arrow.style.display = 'none';
        } else {
          el.arrow.style.display = 'block';
          const ang = Math.atan2(v.y, v.x);
          const R = 42; // percent radius from centre
          const cx = 50 + Math.cos(ang) * R;
          const cy = 50 - Math.sin(ang) * R * 0.62;
          el.arrow.style.left = `${cx}%`;
          el.arrow.style.top = `${cy}%`;
          el.arrow.style.transform = `translate(-50%, -50%) rotate(${(-ang * 180) / Math.PI}deg)`;
        }
      } else if (el.arrow) {
        el.arrow.style.display = 'none';
        if (el.ringDist) el.ringDist.textContent = '';
      }

      // Damage vignette (red, grows with damage; never a number)
      if (el.vignette) el.vignette.style.opacity = String(state.damage * 0.22 + (state.crashed ? 0.3 : 0));

      // Minimap: islands + runway + rings + plane heading
      if (el.minimap && inFlight) drawMinimap(el.minimap, state);
    },
  };
}

function drawMinimap(canvas, state) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(10, 30, 50, 0.55)';
  ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.fill();
  const scale = W / 2600; // world ±1300 -> map
  const px = (x) => W / 2 + x * scale;
  const py = (z) => H / 2 + z * scale;
  // Islands
  ctx.fillStyle = 'rgba(120, 200, 120, 0.8)';
  const islands = [[0, 0, 280], [-620, -420, 150], [540, -560, 170], [720, 480, 120], [-540, 620, 90], [120, -980, 110]];
  for (const [x, z, r] of islands) {
    ctx.beginPath(); ctx.arc(px(x), py(z), Math.max(2, r * scale), 0, Math.PI * 2); ctx.fill();
  }
  // Runway
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(px(-8), py(-50), 16 * scale + 1, 110 * scale);
  // Rings
  const rings = [[-180, -260], [-620, -420], [540, -560], [300, 120], [0, -320], [720, 480], [-540, 620], [120, -980]];
  rings.forEach(([x, z], i) => {
    ctx.beginPath();
    ctx.arc(px(x), py(z), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = i < state.ringsFlown ? '#37d67a' : i === state.ringsFlown ? '#ffb300' : 'rgba(42,157,143,0.7)';
    ctx.fill();
  });
  // Plane: triangle pointing along heading (north = up, heading 0 = -Z)
  const hx = -Math.sin(state.heading), hz = -Math.cos(state.heading);
  const cx = px(state.pos.x), cy = py(state.pos.z);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx + hx * 8, cy + hz * 8);
  ctx.lineTo(cx - hz * 5 - hx * 5, cy + hx * 5 - hz * 5);
  ctx.lineTo(cx + hz * 5 - hx * 5, cy - hx * 5 - hz * 5);
  ctx.closePath();
  ctx.fill();
}

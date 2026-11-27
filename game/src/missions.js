// missions.js — Ordered rings, fuel canisters, medals and stars.
// Fresh write from polish-spec.md §1 + §4 + §7.
import * as THREE from 'three';

export const RING_DEFS = [
  { x: -180, y: 55, z: -260, yaw: 0.5, label: 'Pulau Karimbu' },
  { x: -620, y: 70, z: -420, yaw: -0.9, label: 'Pulau Solmar' },
  { x: 540, y: 150, z: -560, yaw: 2.4, label: 'Pulau Bara' },
  { x: 300, y: 45, z: 120, yaw: 1.2, label: 'Lagoon' },
  { x: 0, y: 28, z: -320, yaw: 0.0, label: 'Runway approach' },
  { x: 720, y: 65, z: 480, yaw: -2.0, label: 'Pulau Nusa' },
  { x: -540, y: 50, z: 620, yaw: 0.8, label: 'Pulau Kecil' },
  { x: 120, y: 95, z: -980, yaw: 3.1, label: 'Pulau Terapung' },
];

export const CANISTER_DEFS = [
  { x: -620, y: 100, z: -420, label: 'Solmar canister' },
  { x: 720, y: 95, z: 480, label: 'Nusa canister' },
];

export const RING_RADIUS = 14;

function makeGlowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function buildRings(scene) {
  const rings = [];
  const glowTex = makeGlowTexture('rgba(255,215,0,0.95)', 'rgba(255,170,0,0)');
  for (let i = 0; i < RING_DEFS.length; i++) {
    const def = RING_DEFS[i];
    const grp = new THREE.Group();
    grp.position.set(def.x, def.y, def.z);
    grp.rotation.y = def.yaw;
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(RING_RADIUS, 1.1, 12, 40),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    grp.add(torus);
    // Glow halo sprite on the ring
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.0,
    }));
    glow.scale.set(48, 48, 1);
    grp.add(glow);
    // Vertical light beam into the sky (only the next ring shows it)
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 320, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    beam.position.y = 160;
    grp.add(beam);
    // Label sprite
    const label = makeLabelSprite(def.label);
    label.position.y = RING_RADIUS + 8;
    grp.add(label);
    scene.add(grp);
    rings.push({
      index: i, def, pos: new THREE.Vector3(def.x, def.y, def.z),
      group: grp, torus, glow, beam, label, passed: false,
      baseY: def.y, phase: i * 0.7, flash: 0,
    });
  }
  return rings;
}

function makeLabelSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#ffffff';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(36, 9, 1);
  return spr;
}

export function buildCanisters(scene) {
  const cans = [];
  for (const def of CANISTER_DEFS) {
    const grp = new THREE.Group();
    grp.position.set(def.x, def.y, def.z);
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 7, 12),
      new THREE.MeshLambertMaterial({ color: 0xffb020, emissive: 0x664400 })
    );
    grp.add(body);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(3, 12, 8),
      new THREE.MeshLambertMaterial({ color: 0xffe08a })
    );
    cap.position.y = 4;
    grp.add(cap);
    const label = makeLabelSprite('+45% FUEL');
    label.position.y = 10;
    grp.add(label);
    scene.add(grp);
    cans.push({ def, pos: new THREE.Vector3(def.x, def.y, def.z), group: grp, taken: false, phase: Math.random() * 6 });
  }
  return cans;
}

// Per-frame ring animation: bob + slow spin + flash on pass; colours by state.
// Only the next ring is strongly coloured + beam; later rings dim cyan, scale 0.9.
export function animateRings(rings, ringsFlown, t, dt) {
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    r.group.position.y = r.baseY + Math.sin(t * 0.8 + r.phase) * 2.5;
    r.group.rotation.z += dt * 0.25;
    if (r.flash > 0) {
      r.flash = Math.max(0, r.flash - dt * 2.5);
      const s = 1 + 0.3 * r.flash;
      r.group.scale.set(s, s, s);
    } else {
      r.group.scale.set(i === ringsFlown ? 1 : 0.9, i === ringsFlown ? 1 : 0.9, i === ringsFlown ? 1 : 0.9);
    }
    if (r.passed) {
      r.torus.material.color.setHex(0x22c55e); // green
      r.glow.material.opacity = 0;
      r.beam.material.opacity = 0;
    } else if (i === ringsFlown) {
      r.torus.material.color.setHex(0xffd700); // gold next
      r.glow.material.opacity = 0.55 + 0.25 * Math.sin(t * 4);
      r.beam.material.opacity = 0.28 + 0.14 * Math.sin(t * 3);
    } else {
      r.torus.material.color.setHex(0x1a7f8e); // dim cyan
      r.glow.material.opacity = 0;
      r.beam.material.opacity = 0;
    }
  }
}

export function animateCanisters(cans, t) {
  for (const c of cans) {
    if (c.taken) { c.group.visible = false; continue; }
    c.group.visible = true;
    c.group.position.y = c.def.y + Math.sin(t * 1.2 + c.phase) * 2;
    c.group.rotation.y += 0.01;
  }
}

export function flashRing(ring) { ring.flash = 1; }

export function medalFor(score, damage) {
  if (score >= 3200 && damage === 0) return 'GOLD';
  if (score >= 2200) return 'SILVER';
  return 'BRONZE';
}

// Stars: 3★ = all rings + time < 300 s + damage 0; 2★ = all rings + BUTTER/FIRM; 1★ = finished.
export function starsFor(ringsFlown, time, damage, grade) {
  if (ringsFlown >= 8 && time < 300 && damage === 0) return 3;
  if (ringsFlown >= 8 && (grade === 'BUTTER' || grade === 'FIRM')) return 2;
  return 1;
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export const BEST_KEY = 'island-hopper-best';
export function loadBest() {
  try {
    const v = localStorage.getItem(BEST_KEY);
    return v == null ? null : parseFloat(v);
  } catch (e) { return null; }
}
export function saveBest(t) {
  try {
    const cur = loadBest();
    if (cur == null || t < cur) localStorage.setItem(BEST_KEY, String(t));
  } catch (e) { /* storage unavailable */ }
}

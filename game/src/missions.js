// missions.js — the 8 ordered rings, combo scoring, fuel canisters, and mission complete.
// One clear job: score the pilot's progress and say what happens next.

import * as THREE from 'three';
import { RINGS } from './terrain.js';

const RING_RADIUS = 14;
const RING_SCORE = 100;
const GOLD = 0xffb300;
const DIM_CYAN = 0x2a9d8f;
const FLOWN_GREEN = 0x37d67a;
const FLASH_WHITE = 0xffffff;
const CANISTER_FUEL = 45;
const CANISTER_RADIUS = 10;

/** Two floating fuel canisters: one above Pulau Solmar, one above Pulau Nusa. */
export const CANISTERS = [
  { x: -620, y: 100, z: -420, label: 'Solmar canister' },
  { x: 720, y: 95, z: 480, label: 'Nusa canister' },
];

/** Build the ring meshes (glowing torus + inner disc) into the scene. */
export function buildRings(scene) {
  const rings = RINGS.map((ring, index) => {
    const group = new THREE.Group();
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(RING_RADIUS, 1.4, 10, 40),
      new THREE.MeshBasicMaterial({ color: index === 0 ? GOLD : DIM_CYAN }),
    );
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(RING_RADIUS - 1.5, 32),
      new THREE.MeshBasicMaterial({
        color: index === 0 ? GOLD : DIM_CYAN, transparent: true, opacity: 0.1, side: THREE.DoubleSide,
      }),
    );
    group.add(torus, disc);
    group.position.set(ring.x, ring.y, ring.z);
    group.rotation.y = ring.yaw;
    group.userData.index = index;
    group.userData.baseY = ring.y;
    scene.add(group);
    return { def: ring, group, torus, disc, flown: false, flash: 0 };
  });
  return rings;
}

/** Repaint rings: next glows gold, pending stay dim cyan, flown go green. */
export function updateRingColors(rings) {
  const next = rings.find((ring) => !ring.flown);
  for (const ring of rings) {
    if (ring.flash > 0) continue;
    const color = ring.flown ? FLOWN_GREEN : (ring === next ? GOLD : DIM_CYAN);
    ring.torus.material.color.set(color);
    ring.disc.material.color.set(color);
  }
}

/** Label of the next ring in order, for the HUD mission line. */
export function nextRingLabel(rings) {
  const next = rings.find((ring) => !ring.flown);
  return next ? `Ring ${next.group.userData.index + 1} — ${next.def.label}` : '—';
}

/** The next ring in order (or null when all 8 are flown). */
export function nextRing(rings) {
  return rings.find((ring) => !ring.flown) || null;
}

/**
 * Check whether the plane flew through the NEXT ring in order.
 * Rings must be flown 1-8; flying through a later ring early does nothing.
 * Returns the ring when one was just flown, else null.
 */
export function checkRingPass(rings, pos) {
  const ring = nextRing(rings);
  if (!ring) return null;
  const dx = pos.x - ring.def.x;
  const dy = pos.y - ring.def.y;
  const dz = pos.z - ring.def.z;
  if (Math.sqrt(dx * dx + dy * dy + dz * dz) < RING_RADIUS - 1) {
    ring.flown = true;
    ring.flash = 0.45;
    ring.torus.material.color.set(FLASH_WHITE);
    ring.disc.material.color.set(FLASH_WHITE);
    ring.group.scale.setScalar(1.3);
    updateRingColors(rings);
    return ring;
  }
  return null;
}

/**
 * Combo points for a ring pass: ring n in order pays 100 x n
 * (ring 1 = +100, ring 2 = +200, ring 3 = +300, …). Returns { points, multiplier }.
 */
export function comboFor(ringsFlownBefore) {
  const multiplier = ringsFlownBefore + 1;
  return { points: RING_SCORE * multiplier, multiplier };
}

/** Refuel + repair on a good runway landing. Returns what was restored. */
export function refuelAndRepair(state) {
  const fuelAdded = Math.round(100 - state.fuel);
  const repaired = state.damage;
  state.fuel = 100;
  state.damage = 0;
  return { fuelAdded, repaired };
}

/** True when every ring has been flown. */
export function missionComplete(rings) {
  return rings.every((ring) => ring.flown);
}

/** Reset all rings to unflown (for Fly Again). */
export function resetRings(rings) {
  for (const ring of rings) {
    ring.flown = false;
    ring.flash = 0;
    ring.group.scale.setScalar(1);
  }
  updateRingColors(rings);
}

/** Build the two floating fuel canisters into the scene. */
export function buildCanisters(scene) {
  return CANISTERS.map((def, index) => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 5, 10),
      new THREE.MeshLambertMaterial({ color: 0xffb300 }),
    );
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 1.2, 8),
      new THREE.MeshLambertMaterial({ color: 0x8a5a2b }),
    );
    cap.position.y = 3;
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(4.2, 0.5, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd54f }),
    );
    halo.rotation.x = Math.PI / 2;
    group.add(body, cap, halo);
    group.position.set(def.x, def.y, def.z);
    group.userData.baseY = def.y;
    group.userData.index = index;
    scene.add(group);
    return { def, group, taken: false };
  });
}

/** Pick up a canister within range: +45% fuel once each. Returns the canister or null. */
export function checkCanisterPickup(canisters, state) {
  for (const can of canisters) {
    if (can.taken) continue;
    const dx = state.pos.x - can.def.x;
    const dy = state.pos.y - can.def.y;
    const dz = state.pos.z - can.def.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) < CANISTER_RADIUS + 4) {
      can.taken = true;
      can.group.visible = false;
      state.fuel = Math.min(100, state.fuel + CANISTER_FUEL);
      return can;
    }
  }
  return null;
}

/** Reset canisters so they can be collected again (for Fly Again). */
export function resetCanisters(canisters) {
  for (const can of canisters) {
    can.taken = false;
    can.group.visible = true;
  }
}

/** Gentle bob + spin for the rings, flash decay after a pass, canister bob + spin. */
export function animateRings(rings, canisters, t, dt) {
  for (const ring of rings) {
    if (ring.flown && ring.flash <= 0) continue;
    const baseY = ring.group.userData.baseY;
    const index = ring.group.userData.index;
    ring.group.position.y = baseY + Math.sin(t * 1.4 + index) * 1.5;
    ring.group.rotation.z = t * 0.15;
    if (ring.flash > 0) {
      ring.flash = Math.max(0, ring.flash - dt);
      const k = ring.flash / 0.45;
      ring.group.scale.setScalar(1 + 0.3 * k);
      if (ring.flash === 0) {
        ring.group.scale.setScalar(1);
        updateRingColors(rings);
      }
    }
  }
  for (const can of canisters) {
    if (can.taken) continue;
    can.group.position.y = can.group.userData.baseY + Math.sin(t * 1.8 + can.group.userData.index * 2) * 1.5;
    can.group.rotation.y = t * 0.8;
  }
}

export { RING_SCORE, CANISTER_FUEL };

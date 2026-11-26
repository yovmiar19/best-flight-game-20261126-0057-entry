// missions.js — the 8 glowing rings, landing refuel/repair, and mission complete.
// One clear job: score the pilot's progress and say what happens next.

import * as THREE from 'three';
import { RINGS } from './terrain.js';

const RING_RADIUS = 14;
const RING_SCORE = 100;

/** Build the ring meshes (glowing torus + inner disc) into the scene. */
export function buildRings(scene) {
  const rings = RINGS.map((ring, index) => {
    const group = new THREE.Group();
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(RING_RADIUS, 1.4, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0xffb300 }),
    );
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(RING_RADIUS - 1.5, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffb300, transparent: true, opacity: 0.1, side: THREE.DoubleSide,
      }),
    );
    group.add(torus, disc);
    group.position.set(ring.x, ring.y, ring.z);
    group.rotation.y = ring.yaw;
    group.userData.index = index;
    group.userData.baseY = ring.y;
    scene.add(group);
    return { def: ring, group, torus, flown: false };
  });
  return rings;
}

/** Label of the next unflown ring, for the HUD mission line. */
export function nextRingLabel(rings) {
  const next = rings.find((ring) => !ring.flown);
  return next ? `${next.def.label} ring` : '—';
}

/**
 * Check whether the plane flew through an unflown ring.
 * Returns the ring when one was just flown, else null.
 */
export function checkRingPass(rings, pos) {
  for (const ring of rings) {
    if (ring.flown) continue;
    const dx = pos.x - ring.def.x;
    const dy = pos.y - ring.def.y;
    const dz = pos.z - ring.def.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) < RING_RADIUS - 1) {
      ring.flown = true;
      ring.torus.material.color.set(0x37d67a);
      return ring;
    }
  }
  return null;
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

/** Gentle bob + spin for the rings so they read as alive. */
export function animateRings(rings, t) {
  for (const ring of rings) {
    if (ring.flown) continue;
    const baseY = ring.group.userData.baseY;
    const index = ring.group.userData.index;
    ring.group.position.y = baseY + Math.sin(t * 1.4 + index) * 1.5;
    ring.group.rotation.z = t * 0.15;
  }
}

export { RING_SCORE };

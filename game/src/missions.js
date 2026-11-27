// missions.js — Island Hopper v3: rings + canisters + score, spec §1.6 (v1).
// Ring order 1-8, pass radius 13 (RING_RADIUS 14 - 1), score 100*n, combo = n.

import { RINGS } from './terrain.js';

export const RING_RADIUS = 14;
export const PASS_RADIUS = RING_RADIUS - 1; // 13
export const CANISTERS = [
  { x: -620, y: 100, z: -420, label: 'Solmar' },
  { x: 720, y: 95, z: 480, label: 'Nusa' },
];
export const CANISTER_RADIUS = 10;
export const CANISTER_FUEL = 45;

const THREE = window.THREE;

export function createMissions(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const ringObjs = [];
  const beamMatBase = new THREE.MeshBasicMaterial({
    color: 0xffc94d, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
  });

  RINGS.forEach((r, i) => {
    const g = new THREE.Group();
    g.position.set(r.x, r.y, r.z);
    g.rotation.y = r.yaw;
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(RING_RADIUS, 0.9, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0x2a9d8f, transparent: true, opacity: 0.55 }),
    );
    g.add(torus);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 130, 10, 1, true), beamMatBase.clone());
    beam.visible = false;
    g.add(beam);
    group.add(g);
    ringObjs.push({ def: r, group: g, torus, beam, flash: 0, index: i });
  });

  // Fuel canisters: floating glowing drums
  const canObjs = CANISTERS.map((c) => {
    const g = new THREE.Group();
    g.position.set(c.x, c.y, c.z);
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 4.5, 12),
      new THREE.MeshLambertMaterial({ color: 0xff5722, emissive: 0x7a2400 }),
    );
    g.add(body);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 1, 10),
      new THREE.MeshLambertMaterial({ color: 0xffd166 }),
    );
    cap.position.y = 2.6;
    g.add(cap);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(4.2, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffa726, transparent: true, opacity: 0.22 }),
    );
    g.add(glow);
    group.add(g);
    return { def: c, group: g, taken: false, bobPhase: Math.random() * 6 };
  });

  return {
    ringObjs,
    canObjs,
    // Check the NEXT ring only (ordered 1-8). Returns { n, points, label } or null.
    checkRing(state) {
      const n = state.ringsFlown + 1;
      if (n > RINGS.length) return null;
      const r = RINGS[n - 1];
      const d = Math.hypot(state.pos.x - r.x, state.pos.y - r.y, state.pos.z - r.z);
      if (d < PASS_RADIUS) {
        const points = 100 * n;
        state.score += points;
        state.ringsFlown = n;
        const obj = ringObjs[n - 1];
        obj.flash = 0.45;
        obj.torus.material.color.setHex(0xffffff);
        return { n, points, label: r.label };
      }
      return null;
    },
    // Canister pickup: fuel +45%. Returns the canister def or null.
    checkCanister(state) {
      for (const c of canObjs) {
        if (c.taken) continue;
        const d = Math.hypot(state.pos.x - c.def.x, state.pos.y - c.def.y, state.pos.z - c.def.z);
        if (d < CANISTER_RADIUS) {
          c.taken = true;
          c.group.visible = false;
          state.fuel = Math.min(100, state.fuel + CANISTER_FUEL);
          return c.def;
        }
      }
      return null;
    },
    reset() {
      for (const o of ringObjs) {
        o.flash = 0;
        o.torus.material.color.setHex(0x2a9d8f);
        o.torus.material.opacity = 0.55;
        o.group.scale.set(1, 1, 1);
        o.beam.visible = false;
      }
      for (const c of canObjs) { c.taken = false; c.group.visible = true; }
    },
    update(state, dt, t) {
      const next = state.ringsFlown; // 0-based index of next ring
      ringObjs.forEach((o, i) => {
        if (o.flash > 0) {
          o.flash -= dt;
          o.group.scale.setScalar(1.3);
          if (o.flash <= 0) {
            o.group.scale.setScalar(1);
            o.torus.material.color.setHex(0x37d67a);
          }
        } else if (i < state.ringsFlown) {
          o.torus.material.color.setHex(0x37d67a);
          o.torus.material.opacity = 0.7;
          o.beam.visible = false;
        } else if (i === next) {
          const pulse = 0.75 + 0.25 * Math.sin(t * 4);
          o.torus.material.color.setHex(0xffb300);
          o.torus.material.opacity = pulse;
          o.beam.visible = true;
          o.beam.material.opacity = 0.12 + 0.08 * Math.sin(t * 4);
        } else {
          o.torus.material.color.setHex(0x2a9d8f);
          o.torus.material.opacity = 0.55;
          o.beam.visible = false;
        }
      });
      for (const c of canObjs) {
        if (c.taken) continue;
        c.group.position.y = c.def.y + Math.sin(t * 1.5 + c.bobPhase) * 1.5;
        c.group.rotation.y += dt * 0.8;
      }
    },
  };
}

export function missionComplete(state) {
  return state.ringsFlown >= RINGS.length;
}

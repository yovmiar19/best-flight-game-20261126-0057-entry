// plane.js — the low-poly prop plane: build the mesh and pose it from flight state.
// One clear job: everything about how the aircraft looks.

import * as THREE from 'three';

const ORANGE = 0xff6d2d;
const CREAM = 0xfff3e0;
const DARK = 0x37474f;

/** Build the plane mesh. Forward is -Z, up is +Y. Returns { group, propeller }. */
export function buildPlane() {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: ORANGE });
  const cream = new THREE.MeshLambertMaterial({ color: CREAM });
  const dark = new THREE.MeshLambertMaterial({ color: DARK });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd8ef });

  // Fuselage: a tapered cylinder pointing forward (-Z).
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 6.4, 10), paint);
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);

  // Nose cone.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 10), cream);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -4;
  group.add(nose);

  // Cockpit canopy.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), glass);
  canopy.scale.set(1, 0.75, 1.6);
  canopy.position.set(0, 0.85, -0.6);
  group.add(canopy);

  // Main wings (slightly swept back).
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.22, 2.2), cream);
  wing.position.set(0, 0.1, 0.4);
  group.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 2.0), paint);
    tip.position.set(side * 5.6, 0.1, 0.4);
    group.add(tip);
  }

  // Tail: horizontal stabiliser + vertical fin.
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 1.4), cream);
  tailWing.position.set(0, 0.25, 3.0);
  group.add(tailWing);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.9, 1.6), paint);
  fin.position.set(0, 1.0, 3.0);
  group.add(fin);

  // Propeller: hub + two blades, spins around Z.
  const propeller = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), dark);
  propeller.add(hub);
  for (const angle of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.6, 0.12), dark);
    blade.rotation.z = angle;
    propeller.add(blade);
  }
  propeller.position.z = -4.9;
  group.add(propeller);

  // Landing gear: two wheels + struts.
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), dark);
    strut.position.set(side * 0.9, -0.9, 0.6);
    group.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 0.9, -1.45, 0.6);
    group.add(wheel);
  }

  // Damage smoke anchor (a small grey puff shown when damaged).
  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x666666, transparent: true, opacity: 0.7 }),
  );
  smoke.position.set(0, 0.4, 2.6);
  smoke.visible = false;
  group.add(smoke);

  return { group, propeller, smoke };
}

/** Pose the plane group from flight state (position, heading, pitch, roll). */
export function posePlane(plane, state) {
  plane.group.position.copy(state.pos);
  plane.group.rotation.set(0, 0, 0);
  plane.group.rotateY(state.heading);
  plane.group.rotateX(state.pitch);
  plane.group.rotateZ(state.roll);
}

/** Spin the propeller faster with throttle; puff smoke while damaged. */
export function animatePlane(plane, state, dt, t) {
  plane.propeller.rotation.z -= dt * (4 + state.throttle * 42);
  plane.smoke.visible = state.damage > 0 && !state.onGround;
  if (plane.smoke.visible) {
    const s = 0.7 + Math.sin(t * 9) * 0.25;
    plane.smoke.scale.setScalar(s);
    plane.smoke.position.y = 0.4 + Math.sin(t * 6) * 0.3;
  }
}

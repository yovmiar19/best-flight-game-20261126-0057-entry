// plane.js — F-14D Tomcat model with animated variable-sweep wings.
// Fresh write from polish-spec.md §2. Forward = -Z, up = +Y.
// Length ~7.6, wingspan extended ~11.2, swept ~7.2. Navy grey, NO propeller.
import * as THREE from 'three';

export const MAX_SPEED = 62;

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function buildPlane() {
  const group = new THREE.Group();
  const GREY = 0x8a9ba8, DARK = 0x74808e, NOSE = 0x5a6b7a, SPINE = 0x6b7c8c;
  const ENGINE = 0x4a5560, INTAKE = 0x2f3a44;

  // Fuselage: wide flat "pancake" body
  group.add(box(2.4, 0.9, 5.2, GREY, 0, 0, 0.6));
  group.add(box(2.0, 0.25, 4.6, DARK, 0, -0.5, 0.6)); // belly plate
  // Nose radome cone pointing forward (-Z)
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.85, 2.6, 16),
    new THREE.MeshLambertMaterial({ color: NOSE })
  );
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -3.6);
  nose.castShadow = true;
  group.add(nose);
  // Rear taper
  group.add(box(2.0, 0.8, 1.6, GREY, 0, 0, 3.2));
  // Spine stripe
  group.add(box(0.5, 0.25, 4.5, SPINE, 0, 0.55, 0.4));

  // Canopy bubble
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshPhongMaterial({ color: 0x9fd8ef, shininess: 120, specular: 0xffffff })
  );
  canopy.scale.set(1, 0.7, 1.9);
  canopy.position.set(0, 0.75, -1.4);
  canopy.castShadow = true;
  group.add(canopy);

  // Wing gloves (fixed, swept)
  for (const s of [-1, 1]) {
    const glove = box(1.6, 0.15, 1.8, GREY, s * 1.5, 0.05, -0.4);
    glove.rotation.y = s * 0.35;
    group.add(glove);
  }

  // VARIABLE-SWEEP WINGS: pivot groups at (±1.15, 0.05, +0.2).
  // Wing box 4.6 span, inner edge at the pivot (mesh offset x ±2.3).
  const wings = {};
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 1.15, 0.05, 0.2);
    const wing = box(4.6, 0.16, 2.3, GREY, s * 2.3, 0, 0);
    pivot.add(wing);
    // darker tip
    const tip = box(0.5, 0.17, 2.0, DARK, s * 4.35, 0, 0);
    pivot.add(tip);
    // Sweep back: a wing extending toward -X needs +rotation.y to swing its
    // tip toward +Z (backward); the +X wing needs -rotation.y. (Verified by
    // the rotation matrix: z' = -x·sin(α), so α and x must have opposite signs.)
    pivot.rotation.y = -s * 0.35; // 20° extended
    group.add(pivot);
    wings[s < 0 ? 'left' : 'right'] = pivot;
  }

  // Twin tails: canted outward, dark tip bands
  for (const s of [-1, 1]) {
    const fin = box(0.18, 1.9, 1.7, GREY, s * 1.35, 1.1, 3.1);
    fin.rotation.z = -s * 0.12; // tops lean out
    group.add(fin);
    const band = box(0.2, 0.25, 1.7, DARK, s * 1.48, 1.95, 3.1);
    band.rotation.z = -s * 0.12;
    group.add(band);
  }

  // Stabilators
  group.add(box(4.6, 0.14, 1.5, GREY, 0, 0.15, 3.2));

  // Twin engines: nacelles + nozzles + afterburner glow + flames
  const exhausts = [];
  const flames = [];
  for (const s of [-1, 1]) {
    const nac = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 3.2, 14),
      new THREE.MeshLambertMaterial({ color: ENGINE })
    );
    nac.rotation.x = Math.PI / 2;
    nac.position.set(s * 1.05, -0.15, 2.2);
    nac.castShadow = true;
    group.add(nac);
    const noz = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.55, 0.5, 14),
      new THREE.MeshLambertMaterial({ color: 0x333d47 })
    );
    noz.rotation.x = Math.PI / 2;
    noz.position.set(s * 1.05, -0.15, 3.9);
    group.add(noz);
    // Afterburner glow disc facing +Z
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 20),
      new THREE.MeshBasicMaterial({ color: 0xff6d00, transparent: true, opacity: 0 })
    );
    glow.position.set(s * 1.05, -0.15, 4.2);
    group.add(glow);
    exhausts.push(glow);
    // Flame cone pointing +Z, additive orange
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 1.6, 12),
      new THREE.MeshBasicMaterial({ color: 0xffa726, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    flame.rotation.x = Math.PI / 2; // cone tip points +Z after rotation
    flame.position.set(s * 1.05, -0.15, 4.9);
    group.add(flame);
    flames.push(flame);
  }

  // Intakes
  for (const s of [-1, 1]) {
    group.add(box(0.7, 0.9, 2.2, INTAKE, s * 1.35, -0.1, -0.6));
  }

  // Landing gear
  const gearMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12);
  function wheel(x, z) {
    const w = new THREE.Mesh(wheelGeo, gearMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, -1.1, z);
    w.castShadow = true;
    group.add(w);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6), gearMat);
    strut.position.set(x, -0.75, z);
    group.add(strut);
  }
  wheel(0, -2.2);
  wheel(-1.0, 1.2);
  wheel(1.0, 1.2);

  // Damage smoke puff
  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x555555, transparent: true, opacity: 0.8 })
  );
  smoke.position.set(0, 0.5, 2.8);
  smoke.visible = false;
  group.add(smoke);

  return { group, wings, exhausts, flames, smoke };
}

// Pose: rotation order Y (heading) then X (pitch) then Z (roll).
export function posePlane(plane, state) {
  plane.group.position.copy(state.pos);
  plane.group.rotation.order = 'YXZ';
  plane.group.rotation.y = state.heading;
  plane.group.rotation.x = -state.pitch; // nose up = positive pitch
  plane.group.rotation.z = -state.roll;  // bank right = right wing down
}

// Wing sweep + afterburner + damage smoke animation.
// Sweep: 20° (0.35 rad) extended at low speed -> 68° (1.19 rad) at MAX_SPEED.
export function animatePlane(plane, state, dt, t) {
  const frac = Math.max(0, Math.min(1, state.speed / MAX_SPEED));
  const target = 0.35 + (1.19 - 0.35) * frac;
  const k = Math.min(1, 2 * dt);
  const curL = plane.wings.left.rotation.y;
  const curR = plane.wings.right.rotation.y;
  plane.wings.left.rotation.y = curL + (target - curL) * k;
  plane.wings.right.rotation.y = curR + (-target - curR) * k;

  const th = state.throttle;
  for (const g of plane.exhausts) {
    g.material.opacity = th > 0.6 ? (th - 0.6) / 0.4 : 0;
  }
  for (const f of plane.flames) {
    const on = th > 0.85;
    f.material.opacity = on ? 0.75 : 0;
    if (on) {
      const len = 1.6 * (0.7 + 0.6 * th);
      f.scale.set(1, len / 1.6, 1);
    }
  }

  if (state.damage > 0 && !state.onGround) {
    plane.smoke.visible = true;
    const s = 1 + 0.4 * Math.sin(t * 9);
    plane.smoke.scale.set(s, s, s);
  } else {
    plane.smoke.visible = false;
  }
}

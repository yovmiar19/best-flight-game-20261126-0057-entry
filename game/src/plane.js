// plane.js — Island Hopper v3: F-14D Tomcat model, spec §2.1 (v2 geometry verbatim)
// + pose per spec §1.3 (NO negation, NO rotation order change).
// Forward = -Z, up = +Y. No propeller anywhere.

const THREE = window.THREE;

const GREY = 0x8a9ba8;
const DARK = 0x74808e;
const NOSE = 0x5a6b7a;
const SPINE = 0x6b7c8c;
const ENGINE = 0x4a5560;
const INTAKE = 0x2f3a44;

function lam(color) { return new THREE.MeshLambertMaterial({ color }); }

export function createPlane(scene) {
  const group = new THREE.Group();

  // --- Fuselage ---
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 5.2), lam(GREY));
  body.position.set(0, 0, 0.6);
  group.add(body);
  const belly = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.25, 4.6), lam(DARK));
  belly.position.set(0, -0.5, 0.6);
  group.add(belly);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.6, 12), lam(NOSE));
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -3.6);
  group.add(nose);
  const rear = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 1.6), lam(DARK));
  rear.position.set(0, 0, 3.2);
  group.add(rear);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 4.5), lam(SPINE));
  spine.position.set(0, 0.55, 0.4);
  group.add(spine);

  // --- Canopy bubble ---
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshPhongMaterial({ color: 0x9fd8ef, shininess: 120, specular: 0xffffff }),
  );
  canopy.scale.set(1, 0.7, 1.9);
  canopy.position.set(0, 0.75, -1.4);
  group.add(canopy);

  // --- Wing gloves (fixed, swept) ---
  for (const s of [-1, 1]) {
    const glove = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 1.8), lam(DARK));
    glove.position.set(s * 1.5, 0.05, -0.4);
    glove.rotation.y = s * 0.35;
    group.add(glove);
  }

  // --- Variable-sweep wings: pivot groups, sweep follows speed ---
  const wingPivots = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 1.15, 0.05, 0.2);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.16, 2.3), lam(GREY));
    wing.position.set(s * 2.3, 0, 0);
    pivot.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.17, 2.0), lam(DARK));
    tip.position.set(s * 4.35, 0, 0);
    pivot.add(tip);
    group.add(pivot);
    wingPivots.push({ pivot, s });
  }

  // --- Twin tails, canted outward ---
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.9, 1.7), lam(GREY));
    fin.position.set(s * 1.35, 1.1, 3.1);
    fin.rotation.z = -s * 0.12;
    group.add(fin);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 1.7), lam(DARK));
    band.position.set(s * 1.48, 1.95, 3.1);
    band.rotation.z = -s * 0.12;
    group.add(band);
  }

  // --- Stabilator ---
  const stab = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.14, 1.5), lam(GREY));
  stab.position.set(0, 0.15, 3.2);
  group.add(stab);

  // --- Twin engines: nacelle + nozzle + afterburner glow/flame ---
  const glows = [];
  const flames = [];
  for (const s of [-1, 1]) {
    const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.2, 12), lam(ENGINE));
    nac.rotation.x = Math.PI / 2;
    nac.position.set(s * 1.05, -0.15, 2.2);
    group.add(nac);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.5, 12), lam(INTAKE));
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(s * 1.05, -0.15, 3.9);
    group.add(nozzle);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff6d00, transparent: true, opacity: 0 });
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), glowMat);
    glow.position.set(s * 1.05, -0.15, 4.2);
    group.add(glow);
    glows.push(glowMat);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xffa726, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 10), flameMat);
    flame.rotation.x = Math.PI / 2;
    flame.position.set(s * 1.05, -0.15, 4.9);
    group.add(flame);
    flames.push({ mesh: flame, mat: flameMat });
  }

  // --- Intakes ---
  for (const s of [-1, 1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 2.2), lam(INTAKE));
    intake.position.set(s * 1.35, -0.1, -0.6);
    group.add(intake);
  }

  // --- Navigation lights: red port / green starboard wingtip ---
  for (const [s, color] of [[-1, 0xff2222], [1, 0x22ff66]]) {
    const nav = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color }),
    );
    nav.position.set(s * 4.55, 0.05, 0.2);
    group.add(nav);
  }

  // --- Landing gear: 3 wheels + struts ---
  const gearMat = lam(0x222222);
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelSpots = [[0, -2.2], [-1.0, 1.2], [1.0, 1.2]];
  for (const [wx, wz] of wheelSpots) {
    const wheel = new THREE.Mesh(wheelGeo, gearMat);
    wheel.position.set(wx, -0.85, wz);
    group.add(wheel);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.55, 6), lam(DARK));
    strut.position.set(wx, -0.55, wz);
    group.add(strut);
  }

  // --- Damage smoke (visible only when damage > 0 and airborne) ---
  const smokeMat = new THREE.MeshLambertMaterial({ color: 0x555555, transparent: true, opacity: 0.6 });
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), smokeMat);
  smoke.position.set(0, 0.5, 2.8);
  smoke.visible = false;
  group.add(smoke);

  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  scene.add(group);

  let sweep = 0.35;

  return {
    group,
    // Pose per spec §1.3 — NO negation, NO rotation.order change.
    pose(state) {
      group.position.copy(state.pos);
      group.rotation.set(0, 0, 0);
      group.rotateY(state.heading);
      group.rotateX(state.pitch);
      group.rotateZ(state.roll);
    },
    // Only wing sweep + afterburner + smoke animate (spec §2.1).
    animate(state, dt, t) {
      const speedFrac = Math.max(0, Math.min(1, state.speed / 62));
      const target = 0.35 + (1.19 - 0.35) * speedFrac;
      const k = Math.min(1, 2 * dt);
      sweep += (target - sweep) * k;
      for (const { pivot, s } of wingPivots) pivot.rotation.y = -s * sweep;
      const th = state.throttle;
      for (const g of glows) g.opacity = th > 0.6 ? (th - 0.6) / 0.4 : 0;
      for (const f of flames) {
        const on = th > 0.85;
        f.mat.opacity = on ? 0.75 : 0;
        // Grow the flame backwards from the nozzle (base stays at z 4.2).
        const len = 1.6 * (0.7 + 0.6 * th);
        f.mesh.scale.set(1, len / 1.6, 1);
        f.mesh.position.z = 4.2 + len / 2;
      }
      const showSmoke = state.damage > 0 && !state.onGround;
      smoke.visible = showSmoke;
      if (showSmoke) {
        const s = 1 + 0.4 * Math.sin(t * 9);
        smoke.scale.set(s, s, s);
      }
    },
  };
}

// terrain.js — Island Hopper v3: world geometry EXACTLY per spec §1.7 (v1 numbers)
// plus golden-hour visuals per spec §2.2. Geometry numbers are verbatim; only the
// rendering (materials, sky, sea, foam, clouds, trees) is polish.

export const SEA_SIZE = 4200;

export const ISLANDS = [
  { name: 'Karimbu', x: 0, z: 0, r: 280, h: 8 },
  { name: 'Solmar', x: -620, z: -420, r: 150, h: 14 },
  { name: 'Bara', x: 540, z: -560, r: 170, h: 90, volcano: true },
  { name: 'Nusa', x: 720, z: 480, r: 120, h: 10 },
  { name: 'Kecil', x: -540, z: 620, r: 90, h: 6 },
  { name: 'Terapung', x: 120, z: -980, r: 110, h: 18 },
];

export const RINGS = [
  { x: -180, y: 55, z: -260, yaw: 0.5, label: 'Pulau Karimbu' },
  { x: -620, y: 70, z: -420, yaw: -0.9, label: 'Pulau Solmar' },
  { x: 540, y: 150, z: -560, yaw: 2.4, label: 'Pulau Bara' },
  { x: 300, y: 45, z: 120, yaw: 1.2, label: 'Lagoon' },
  { x: 0, y: 28, z: -320, yaw: 0.0, label: 'Runway approach' },
  { x: 720, y: 65, z: 480, yaw: -2.0, label: 'Pulau Nusa' },
  { x: -540, y: 50, z: 620, yaw: 0.8, label: 'Pulau Kecil' },
  { x: 120, y: 95, z: -980, yaw: 3.1, label: 'Pulau Terapung' },
];

// v1 groundHeightAt — flat-top + quadratic edge. Do NOT use a cos-dome.
export function groundHeightAt(x, z) {
  for (const isl of ISLANDS) {
    const d = Math.hypot(x - isl.x, z - isl.z);
    if (d < isl.r) {
      const edge = Math.max(0, (d - isl.r * 0.82) / (isl.r * 0.18));
      return isl.h * (1 - edge * edge);
    }
  }
  return 0;
}

export function overRunway(x, z) {
  return Math.abs(x - 0) < 16 / 2 + 4 && Math.abs(z - 60) < 220 / 2;
}

// Deterministic RNG for decoration (spec §1.7)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const THREE = window.THREE;

export function createTerrain(scene) {
  const api = { sea: null, clouds: [], volcanoSmoke: null, sun: null, update };
  const rng = mulberry32(20261126);

  // ---- Sky dome: warm gradient (golden hour), not a flat background ----
  const skyGeo = new THREE.SphereGeometry(2400, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x3a5a8c) },
      mid: { value: new THREE.Color(0x7fa8c9) },
      horizon: { value: new THREE.Color(0xffb066) },
      sunDir: { value: new THREE.Vector3(-0.55, 0.16, -0.8).normalize() },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir;
      void main(){
        float h = clamp(vDir.y, -0.08, 1.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, top, smoothstep(0.18, 0.75, h));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        c += vec3(1.0, 0.55, 0.18) * pow(s, 90.0) * 0.9;
        c += vec3(1.0, 0.6, 0.25) * pow(s, 6.0) * 0.22;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Fog matched to the horizon colour
  scene.fog = new THREE.Fog(0xf2b98a, 320, 2100);

  // ---- Lights: low warm sun + hemisphere + soft shadows ----
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a6f4d, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc27a, 2.1);
  sun.position.set(-420, 130, -620);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 1600;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  api.sun = sun;

  // Sun disc on the horizon
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false, transparent: true, opacity: 0.95 }),
  );
  sunDisc.position.set(-1150, 95, -1650);
  sunDisc.lookAt(0, 60, 0);
  scene.add(sunDisc);

  // ---- Sea: cheap vertex-wave plane ----
  const seaGeo = new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, 48, 48);
  seaGeo.rotateX(-Math.PI / 2);
  const seaMat = new THREE.MeshPhongMaterial({
    color: 0x1d6f8e, shininess: 90, specular: 0xffc27a, transparent: true, opacity: 0.94,
  });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.position.y = 0;
  sea.receiveShadow = true;
  scene.add(sea);
  api.sea = sea;
  const seaBase = seaGeo.attributes.position.array.slice();

  // ---- Islands: sand rim + green top, volcano crater + smoke on Bara ----
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xe8d29a });
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x4f9e4d });
  const grassDark = new THREE.MeshLambertMaterial({ color: 0x3d8a3f });
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x6e5a4a });
  const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff5a1f });
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });

  for (const isl of ISLANDS) {
    const group = new THREE.Group();
    group.position.set(isl.x, 0, isl.z);
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(isl.r * 0.98, isl.r * 1.12, 4, 28), sandMat);
    sand.position.y = -1;
    sand.receiveShadow = true;
    group.add(sand);
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(isl.r * 0.82, isl.r * 0.98, isl.h, 28),
      isl.volcano ? rockMat : grassMat,
    );
    top.position.y = isl.h / 2;
    top.castShadow = true; top.receiveShadow = true;
    group.add(top);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(isl.r * 0.82, 28), isl.volcano ? rockMat : grassDark);
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = isl.h + 0.05;
    cap.receiveShadow = true;
    group.add(cap);
    const foam = new THREE.Mesh(new THREE.RingGeometry(isl.r * 0.99, isl.r * 1.08, 40), foamMat);
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = 0.35;
    group.add(foam);

    if (isl.volcano) {
      const crater = new THREE.Mesh(new THREE.CylinderGeometry(isl.r * 0.16, isl.r * 0.3, 6, 16), rockMat);
      crater.position.y = isl.h + 2;
      group.add(crater);
      const lava = new THREE.Mesh(new THREE.CircleGeometry(isl.r * 0.13, 16), lavaMat);
      lava.rotation.x = -Math.PI / 2;
      lava.position.y = isl.h + 5.2;
      group.add(lava);
      const smokeMat = new THREE.MeshLambertMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.55 });
      const puffs = [];
      for (let i = 0; i < 7; i++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(6 + rng() * 5, 8, 6), smokeMat);
        p.position.set((rng() - 0.5) * 14, isl.h + 8 + i * 7, (rng() - 0.5) * 14);
        p.userData.phase = rng() * Math.PI * 2;
        group.add(p);
        puffs.push(p);
      }
      api.volcanoSmoke = puffs;
    }

    // Decorative trees (deterministic RNG)
    const treeCount = Math.floor(isl.r / 9);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f7d33 });
    for (let i = 0; i < treeCount; i++) {
      const a = rng() * Math.PI * 2;
      const rr = rng() * isl.r * 0.72;
      const tx = Math.cos(a) * rr, tz = Math.sin(a) * rr;
      if (isl.volcano && rr < isl.r * 0.35) continue;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 3, 5), trunkMat);
      trunk.position.set(tx, isl.h + 1.5, tz);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5.5, 6), leafMat);
      leaves.position.set(tx, isl.h + 5, tz);
      leaves.castShadow = true;
      group.add(trunk, leaves);
    }
    scene.add(group);
  }

  // ---- Runway (Karimbu: x 0, z 60, 220 x 16, altitude 8) ----
  const rwGroup = new THREE.Group();
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.5, 220),
    new THREE.MeshLambertMaterial({ color: 0x3c4148 }),
  );
  strip.position.set(0, 8, 60);
  strip.receiveShadow = true;
  rwGroup.add(strip);
  const paintMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
  for (let i = -9; i <= 9; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 6), paintMat);
    dash.position.set(0, 8.28, 60 + i * 11);
    rwGroup.add(dash);
  }
  for (const dz of [-104, 104]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(12, 0.06, 3), paintMat);
    bar.position.set(0, 8.28, 60 + dz);
    rwGroup.add(bar);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  for (let i = -10; i <= 10; i++) {
    for (const sx of [-8.6, 8.6]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), lightMat);
      l.position.set(sx, 8.6, 60 + i * 11);
      rwGroup.add(l);
    }
  }
  scene.add(rwGroup);

  // ---- Clouds: 44 low-poly puffs at varied heights ----
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
  for (let i = 0; i < 44; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(rng() * 3);
    for (let j = 0; j < n; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(6 + rng() * 9, 7, 5), cloudMat);
      s.position.set((rng() - 0.5) * 22, (rng() - 0.5) * 4, (rng() - 0.5) * 10);
      s.scale.y = 0.55;
      c.add(s);
    }
    const a = rng() * Math.PI * 2;
    const rr = 180 + rng() * 1250;
    c.position.set(Math.cos(a) * rr, 90 + rng() * 170, Math.sin(a) * rr);
    c.userData.drift = 0.4 + rng() * 0.9;
    scene.add(c);
    api.clouds.push(c);
  }

  function update(dt, t, planePos) {
    const pos = sea.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const bx = seaBase[i * 3], bz = seaBase[i * 3 + 2];
      pos.array[i * 3 + 1] = Math.sin(bx * 0.012 + t * 0.9) * 0.55 + Math.cos(bz * 0.015 + t * 0.7) * 0.45;
    }
    pos.needsUpdate = true;
    for (const c of api.clouds) {
      c.position.x += c.userData.drift * dt;
      if (c.position.x > 1500) c.position.x = -1500;
    }
    if (api.volcanoSmoke) {
      for (const p of api.volcanoSmoke) {
        const s = 1 + 0.25 * Math.sin(t * 1.4 + p.userData.phase);
        p.scale.set(s, s, s);
      }
    }
    if (planePos) {
      sun.position.set(planePos.x - 420, planePos.y + 130, planePos.z - 620);
      sun.target.position.set(planePos.x, planePos.y, planePos.z);
      sun.target.updateMatrixWorld();
      sky.position.set(planePos.x, 0, planePos.z);
    }
  }

  return api;
}

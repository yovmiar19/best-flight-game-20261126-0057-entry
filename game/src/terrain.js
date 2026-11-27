// terrain.js — Island Hopper world: islands, runway, sea, sky, clouds, foam.
// Fresh write from polish-spec.md §1 + §5. Deterministic RNG mulberry32(20261126).
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ISLANDS = [
  { name: 'Karimbu', x: 0, z: 0, r: 280, top: 8 },
  { name: 'Solmar', x: -620, z: -420, r: 150, top: 14 },
  { name: 'Bara', x: 540, z: -560, r: 170, top: 90, volcano: true },
  { name: 'Nusa', x: 720, z: 480, r: 120, top: 10 },
  { name: 'Kecil', x: -540, z: 620, r: 90, top: 6 },
  { name: 'Terapung', x: 120, z: -980, r: 110, top: 18 },
];

export const RUNWAY = { x: 0, z: 60, len: 220, w: 16, alt: 8 };

// Smooth island top height with edge falloff; 0 = sea level.
export function groundHeightAt(x, z) {
  let h = 0;
  for (const isl of ISLANDS) {
    const dx = x - isl.x, dz = z - isl.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < isl.r) {
      const t = d / isl.r; // 0 centre -> 1 edge
      const fall = Math.cos(t * Math.PI * 0.5); // 1 -> 0 smooth
      const hh = isl.top * fall * fall;
      if (hh > h) h = hh;
    }
  }
  return h;
}

export function overRunway(x, z) {
  return Math.abs(x - RUNWAY.x) < 12 && Math.abs(z - RUNWAY.z) < 110;
}

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

export function buildTerrain(scene) {
  const rng = mulberry32(20261126);
  const out = { water: null, waterGeo: null, clouds: [], smoke: [], sunSprite: null, sunLight: null, cloudInst: null, waterBase: null };

  // ---- Gradient sky dome: warm orange horizon -> deep blue top ----
  const skyGeo = new THREE.SphereGeometry(3200, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2b4a7a) },
      mid: { value: new THREE.Color(0x7a6a9a) },
      bot: { value: new THREE.Color(0xffb36b) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h = normalize(vP).y; vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.9, h)) : mix(bot, mid, smoothstep(-0.08, 0.25, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // ---- Fog in the horizon colour ----
  scene.fog = new THREE.Fog(0xffc98a, 500, 2600);

  // ---- Golden-hour sun: warm directional light with soft shadows ----
  const sun = new THREE.DirectionalLight(0xffc27a, 2.6);
  sun.position.set(-900, 260, -700);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const S = 120;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 100; sun.shadow.camera.far = 2600;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0x8fa8d8, 0x3a5a3a, 1.0));
  out.sunLight = sun;

  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(90, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false })
  );
  sunDisc.position.set(-1500, 320, -1200);
  sunDisc.lookAt(0, 60, 0);
  scene.add(sunDisc);
  const sunGlowTex = makeGlowTexture('rgba(255,220,140,0.9)', 'rgba(255,150,60,0)');
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunGlowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.9,
  }));
  sunGlow.scale.set(700, 700, 1);
  sunGlow.position.copy(sunDisc.position);
  scene.add(sunGlow);
  out.sunSprite = sunGlow;

  // ---- Sea: animated vertex waves ----
  const waterGeo = new THREE.PlaneGeometry(5200, 5200, 64, 64);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshPhongMaterial({
    color: 0x1e6f8e, shininess: 90, specular: 0xffd9a0, transparent: true, opacity: 0.94,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = 0;
  water.receiveShadow = true;
  scene.add(water);
  out.water = water;
  out.waterGeo = waterGeo;
  out.waterBase = waterGeo.attributes.position.array.slice();

  // ---- Islands ----
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xe8d8a0 });
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x4a9e4a });
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x6b5a4a });
  const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff5a1a });
  const treeTrunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
  const treeTopMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });

  for (const isl of ISLANDS) {
    const grp = new THREE.Group();
    grp.position.set(isl.x, 0, isl.z);
    const base = new THREE.Mesh(new THREE.ConeGeometry(isl.r, isl.top * 0.9 + 6, 28), sandMat);
    base.position.y = (isl.top * 0.9 + 6) / 2 - 3;
    base.receiveShadow = true;
    grp.add(base);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(isl.r * 0.78, isl.top + 2, 28), grassMat);
    cap.position.y = (isl.top + 2) / 2 - 1;
    cap.receiveShadow = true;
    grp.add(cap);
    if (isl.volcano) {
      const crater = new THREE.Mesh(new THREE.CylinderGeometry(isl.r * 0.16, isl.r * 0.22, 6, 20), rockMat);
      crater.position.y = isl.top + 1;
      grp.add(crater);
      const lava = new THREE.Mesh(new THREE.CylinderGeometry(isl.r * 0.13, isl.r * 0.13, 1.2, 20), lavaMat);
      lava.position.y = isl.top + 3.5;
      grp.add(lava);
      for (let i = 0; i < 7; i++) {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(6 + rng() * 5, 8, 6),
          new THREE.MeshLambertMaterial({ color: 0x777777, transparent: true, opacity: 0.75 })
        );
        puff.position.set((rng() - 0.5) * 14, isl.top + 10 + i * 9, (rng() - 0.5) * 14);
        puff.userData.phase = rng() * Math.PI * 2;
        grp.add(puff);
        out.smoke.push(puff);
      }
    }
    // White foam ring hugging the shoreline
    const foam = new THREE.Mesh(
      new THREE.RingGeometry(isl.r - 2, isl.r + 4, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = 0.3;
    grp.add(foam);
    // Trees (deterministic)
    const nTrees = Math.floor(isl.r / 14);
    for (let i = 0; i < nTrees; i++) {
      const a = rng() * Math.PI * 2;
      const rr = rng() * isl.r * 0.62;
      const tx = Math.cos(a) * rr, tz = Math.sin(a) * rr;
      const gy = groundHeightAt(isl.x + tx, isl.z + tz);
      if (gy < 1) continue;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3, 6), treeTrunkMat);
      trunk.position.set(tx, gy + 1.5, tz);
      trunk.castShadow = true;
      grp.add(trunk);
      const top = new THREE.Mesh(new THREE.SphereGeometry(2.2 + rng() * 1.4, 8, 6), treeTopMat);
      top.position.set(tx, gy + 4.4, tz);
      top.castShadow = true;
      grp.add(top);
    }
    scene.add(grp);
  }

  // ---- Runway on Karimbu ----
  const rw = new THREE.Group();
  rw.position.set(RUNWAY.x, RUNWAY.alt, RUNWAY.z);
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.w, 0.4, RUNWAY.len),
    new THREE.MeshLambertMaterial({ color: 0x3d3d44 })
  );
  strip.receiveShadow = true;
  rw.add(strip);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = -4; i <= 4; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 8), dashMat);
    dash.position.set(0, 0.25, i * 22);
    rw.add(dash);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(5, 0.1, 1.6), dashMat);
      bar.position.set(side * 4.5, 0.25, -RUNWAY.len / 2 + 8 + i * 3);
      rw.add(bar);
      const bar2 = bar.clone();
      bar2.position.z = RUNWAY.len / 2 - 8 - i * 3;
      rw.add(bar2);
    }
  }
  scene.add(rw);

  // ---- 40 instanced low-poly clouds (puffs of 3-5 flattened spheres) ----
  const puffGeo = new THREE.SphereGeometry(1, 8, 6);
  // Emissive keeps the clouds bright at golden hour instead of near-black
  // on their shaded side (the sun is very low).
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xfff2e0, emissive: 0x8a7a66, transparent: true, opacity: 0.85 });
  const inst = new THREE.InstancedMesh(puffGeo, cloudMat, 40 * 5);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let idx = 0;
  for (let i = 0; i < 40; i++) {
    const cx = (rng() - 0.5) * 2800;
    const cz = (rng() - 0.5) * 2800;
    const cy = 180 + rng() * 140;
    const puffs = 3 + Math.floor(rng() * 3);
    const cloud = { x: cx, y: cy, z: cz, speed: 1.5 + rng() * 2, puffs: [] };
    for (let p = 0; p < puffs; p++) {
      const ox = (rng() - 0.5) * 34;
      const oy = (rng() - 0.5) * 6;
      const oz = (rng() - 0.5) * 18;
      const s = 10 + rng() * 12;
      cloud.puffs.push({ ox, oy, oz, s, idx });
      m.compose(new THREE.Vector3(cx + ox, cy + oy, cz + oz), q, new THREE.Vector3(s, s * 0.45, s * 0.8));
      inst.setMatrixAt(idx, m);
      idx++;
    }
    out.clouds.push(cloud);
  }
  inst.count = idx;
  inst.instanceMatrix.needsUpdate = true;
  scene.add(inst);
  out.cloudInst = inst;

  return out;
}

// Per-frame world animation: water waves, drifting clouds, volcano smoke.
export function animateTerrain(world, t, dt) {
  const pos = world.waterGeo.attributes.position;
  const base = world.waterBase;
  for (let i = 0; i < pos.count; i++) {
    const bx = base[i * 3], bz = base[i * 3 + 2];
    pos.array[i * 3 + 1] = Math.sin(bx * 0.012 + t * 0.9) * 0.55 + Math.cos(bz * 0.01 + t * 0.7) * 0.55;
  }
  pos.needsUpdate = true;
  // Normals are the expensive part (8k triangles); recompute every 6th frame.
  world._normTick = (world._normTick || 0) + 1;
  if (world._normTick % 6 === 0) world.waterGeo.computeVertexNormals();

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (const c of world.clouds) {
    c.x += c.speed * dt;
    if (c.x > 1500) c.x = -1500;
    for (const p of c.puffs) {
      m.compose(new THREE.Vector3(c.x + p.ox, c.y + p.oy, c.z + p.oz), q, new THREE.Vector3(p.s, p.s * 0.45, p.s * 0.8));
      world.cloudInst.setMatrixAt(p.idx, m);
    }
  }
  world.cloudInst.instanceMatrix.needsUpdate = true;

  for (const puff of world.smoke) {
    const s = 1 + 0.25 * Math.sin(t * 1.3 + puff.userData.phase);
    puff.scale.set(s, s, s);
  }
}

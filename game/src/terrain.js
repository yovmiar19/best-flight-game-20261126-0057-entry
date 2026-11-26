// terrain.js — the island chain: sea, islands, volcano, runway, clouds, sun and fog.
// One clear job: build the static world and answer "how high is the ground here?".

import * as THREE from 'three';

/** Deterministic RNG so the world looks the same on every load. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Islands: name, centre (x, z), radius, top height. The first is the home island. */
export const ISLANDS = [
  { name: 'Pulau Karimbu', x: 0, z: 0, radius: 280, height: 8 },
  { name: 'Pulau Solmar', x: -620, z: -420, radius: 150, height: 14 },
  { name: 'Pulau Bara', x: 540, z: -560, radius: 170, height: 90 },
  { name: 'Pulau Nusa', x: 720, z: 480, radius: 120, height: 10 },
  { name: 'Pulau Kecil', x: -540, z: 620, radius: 90, height: 6 },
  { name: 'Pulau Terapung', x: 120, z: -980, radius: 110, height: 18 },
];

/** The runway sits on Pulau Karimbu, heading north (-Z). */
export const RUNWAY = {
  x: 0, z: 60, length: 220, width: 16, heading: 0, altitude: 8,
};

/** 8 target rings: position, altitude and the yaw the torus faces. */
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

const SEA_SIZE = 4200;

/** Ground height at (x, z): island top inside a disc, sea level 0 outside. */
export function groundHeightAt(x, z) {
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dz = z - island.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < island.radius) {
      const edge = Math.max(0, (d - island.radius * 0.82) / (island.radius * 0.18));
      return island.height * (1 - edge * edge);
    }
  }
  return 0;
}

/** True when (x, z) is over the runway strip. */
export function overRunway(x, z) {
  const dz = z - RUNWAY.z;
  const dx = x - RUNWAY.x;
  return Math.abs(dx) < RUNWAY.width / 2 + 4 && Math.abs(dz) < RUNWAY.length / 2;
}

function makeTree(random) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.8, 4, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a5a2b }),
  );
  trunk.position.y = 2;
  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, 8, 7),
    new THREE.MeshLambertMaterial({ color: 0x2f7d32 }),
  );
  leaves.position.y = 7;
  tree.add(trunk, leaves);
  const s = 0.8 + random() * 0.9;
  tree.scale.setScalar(s);
  return tree;
}

function makeCloud(random) {
  const cloud = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0xfff6e8, transparent: true, opacity: 0.95 });
  const puffs = 3 + Math.floor(random() * 3);
  for (let i = 0; i < puffs; i += 1) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(10 + random() * 12, 8, 6), material);
    puff.position.set((random() - 0.5) * 36, (random() - 0.5) * 6, (random() - 0.5) * 18);
    puff.scale.y = 0.55;
    cloud.add(puff);
  }
  return cloud;
}

/**
 * Build the whole static world into the scene.
 * Returns { water, clouds, smokePuffs, update(dt, t) } for the animated bits.
 */
export function buildTerrain(scene) {
  const random = mulberry32(20261126);

  scene.background = new THREE.Color(0xffb36b);
  scene.fog = new THREE.Fog(0xffc98a, 500, 2600);

  const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
  sun.position.set(-600, 320, -800);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffe0b3, 0x2e6f8e, 0.9));

  // Sun disc low on the horizon.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(70, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }),
  );
  sunDisc.position.set(-900, 260, -1500);
  sunDisc.lookAt(0, 60, 0);
  scene.add(sunDisc);

  // Sea: a big plane whose vertices gently wave.
  const waterGeo = new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, 48, 48);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(
    waterGeo,
    new THREE.MeshLambertMaterial({ color: 0x1e7fa8, transparent: true, opacity: 0.96 }),
  );
  water.position.y = 0;
  scene.add(water);
  const waterBase = waterGeo.attributes.position.array.slice();

  // Islands: sand rim, green top, plus a volcano cone on Pulau Bara.
  for (const island of ISLANDS) {
    const sand = new THREE.Mesh(
      new THREE.CylinderGeometry(island.radius, island.radius * 1.12, 3, 24),
      new THREE.MeshLambertMaterial({ color: 0xe8d29a }),
    );
    sand.position.set(island.x, 1.2, island.z);
    scene.add(sand);
    const top = island.name === 'Pulau Bara'
      ? new THREE.Mesh(
        new THREE.ConeGeometry(island.radius, island.height, 24),
        new THREE.MeshLambertMaterial({ color: 0x6b4a3a }),
      )
      : new THREE.Mesh(
        new THREE.CylinderGeometry(island.radius * 0.96, island.radius, island.height, 24),
        new THREE.MeshLambertMaterial({ color: 0x4caf50 }),
      );
    top.position.set(island.x, island.height / 2, island.z);
    scene.add(top);
  }

  // Volcano crater + smoke on Pulau Bara.
  const crater = new THREE.Mesh(
    new THREE.ConeGeometry(46, 34, 12),
    new THREE.MeshLambertMaterial({ color: 0x3d2b26 }),
  );
  crater.position.set(540, 90 + 15, -560);
  scene.add(crater);
  const smokePuffs = [];
  const smokeMat = new THREE.MeshLambertMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.55 });
  for (let i = 0; i < 7; i += 1) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(7 + i * 1.6, 8, 6), smokeMat.clone());
    puff.position.set(540 + (random() - 0.5) * 10, 108 + i * 9, -560 + (random() - 0.5) * 10);
    puff.userData.phase = random() * Math.PI * 2;
    scene.add(puff);
    smokePuffs.push(puff);
  }

  // Low-poly trees scattered on the flat islands.
  for (const island of ISLANDS) {
    if (island.name === 'Pulau Bara') continue;
    const count = Math.floor(island.radius / 14);
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const dist = random() * island.radius * 0.8;
      const tree = makeTree(random);
      tree.position.set(
        island.x + Math.cos(angle) * dist,
        island.height - 0.4,
        island.z + Math.sin(angle) * dist,
      );
      tree.rotation.y = random() * Math.PI * 2;
      scene.add(tree);
    }
  }

  // Runway: dark strip with white dashes + threshold bars.
  const runwayGroup = new THREE.Group();
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.width, 1, RUNWAY.length),
    new THREE.MeshLambertMaterial({ color: 0x3a3f46 }),
  );
  strip.position.y = RUNWAY.altitude + 0.4;
  runwayGroup.add(strip);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let d = -RUNWAY.length / 2 + 15; d < RUNWAY.length / 2 - 10; d += 24) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 10), dashMat);
    dash.position.set(0, RUNWAY.altitude + 1, d);
    runwayGroup.add(dash);
  }
  for (const end of [-1, 1]) {
    for (let b = -1; b <= 1; b += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 8), dashMat);
      bar.position.set(b * 5, RUNWAY.altitude + 1, end * (RUNWAY.length / 2 - 8));
      runwayGroup.add(bar);
    }
  }
  runwayGroup.position.set(RUNWAY.x, 0, RUNWAY.z);
  scene.add(runwayGroup);

  // Drifting clouds.
  const clouds = [];
  for (let i = 0; i < 12; i += 1) {
    const cloud = makeCloud(random);
    cloud.position.set((random() - 0.5) * 2600, 180 + random() * 140, (random() - 0.5) * 2600);
    cloud.userData.speed = 1.5 + random() * 2;
    scene.add(cloud);
    clouds.push(cloud);
  }

  /** Animate the water, clouds and volcano smoke. */
  function update(dt, t) {
    const pos = waterGeo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const bx = waterBase[i * 3];
      const bz = waterBase[i * 3 + 2];
      pos.array[i * 3 + 1] = Math.sin(bx * 0.012 + t * 0.9) * 1.1 + Math.cos(bz * 0.01 + t * 0.7) * 1.1;
    }
    pos.needsUpdate = true;
    for (const cloud of clouds) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > 1500) cloud.position.x = -1500;
    }
    for (const puff of smokePuffs) {
      puff.position.y += dt * 3;
      puff.material.opacity = 0.55 - ((puff.position.y - 108) / 70) * 0.5;
      if (puff.position.y > 178) {
        puff.position.y = 108;
        puff.material.opacity = 0.55;
      }
      puff.position.x = 540 + Math.sin(t * 0.5 + puff.userData.phase) * 6;
    }
  }

  return { water, clouds, smokePuffs, update };
}

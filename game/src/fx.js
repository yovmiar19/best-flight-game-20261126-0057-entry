// fx.js — visual effects: ring-pass particle bursts and wingtip contrails.
// One clear job: short-lived visuals that make speed and impact read in a still.

import * as THREE from 'three';

const BURST_PARTICLES = 26;
const BURST_LIFE = 0.9;
const TRAIL_POINTS = 36;

/** Spawn a burst of sparks at a position; call updateFx(dt) every frame. */
export function buildFx(scene) {
  const bursts = [];
  const burstGeo = new THREE.BufferGeometry();
  const burstPos = new Float32Array(BURST_PARTICLES * 3);
  burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3));
  const burstMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 2.4, transparent: true, opacity: 1, sizeAttenuation: true,
  });

  // Wingtip contrails: two fading ribbons that follow the plane's wingtips.
  const trails = [];
  for (const side of [-1, 1]) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(TRAIL_POINTS * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.32,
    }));
    line.frustumCulled = false;
    scene.add(line);
    trails.push({ side, line, points: [], last: new THREE.Vector3() });
  }

  /** Fire a white spark burst at `at` (a THREE.Vector3). */
  function spawnBurst(at) {
    const points = new THREE.Points(burstGeo.clone(), burstMat.clone());
    const velocities = [];
    for (let i = 0; i < BURST_PARTICLES; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 6 + Math.random() * 14;
      velocities.push(new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed,
        Math.sin(phi) * Math.sin(theta) * speed,
      ));
      points.geometry.attributes.position.array[i * 3] = at.x;
      points.geometry.attributes.position.array[i * 3 + 1] = at.y;
      points.geometry.attributes.position.array[i * 3 + 2] = at.z;
    }
    points.frustumCulled = false;
    scene.add(points);
    bursts.push({ points, velocities, age: 0 });
  }

  /** Advance bursts and contrails. `plane` is the plane object from plane.js. */
  function update(dt, plane, state) {
    // Bursts: particles fly out and fade.
    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      const burst = bursts[i];
      burst.age += dt;
      const arr = burst.points.geometry.attributes.position.array;
      for (let p = 0; p < BURST_PARTICLES; p += 1) {
        arr[p * 3] += burst.velocities[p].x * dt;
        arr[p * 3 + 1] += burst.velocities[p].y * dt;
        arr[p * 3 + 2] += burst.velocities[p].z * dt;
      }
      burst.points.geometry.attributes.position.needsUpdate = true;
      burst.points.material.opacity = Math.max(0, 1 - burst.age / BURST_LIFE);
      if (burst.age >= BURST_LIFE) {
        scene.remove(burst.points);
        burst.points.geometry.dispose();
        burst.points.material.dispose();
        bursts.splice(i, 1);
      }
    }

    // Contrails: sample each wingtip while airborne and fast, else collapse.
    const flying = !state.onGround && state.speed > 25;
    for (const trail of trails) {
      const tip = new THREE.Vector3(trail.side * 5.6, 0.1, 0.4)
        .applyMatrix4(plane.group.matrixWorld);
      if (flying) {
        if (trail.last.distanceToSquared(tip) > 0.5) {
          trail.points.unshift(tip.clone());
          if (trail.points.length > TRAIL_POINTS) trail.points.pop();
          trail.last.copy(tip);
        }
      } else {
        trail.points.length = 0;
      }
      const arr = trail.line.geometry.attributes.position.array;
      for (let p = 0; p < TRAIL_POINTS; p += 1) {
        const pt = trail.points[Math.min(p, trail.points.length - 1)] || tip;
        arr[p * 3] = pt.x;
        arr[p * 3 + 1] = pt.y;
        arr[p * 3 + 2] = pt.z;
      }
      trail.line.geometry.attributes.position.needsUpdate = true;
      trail.line.material.opacity = flying ? 0.32 : 0;
    }
  }

  return { spawnBurst, update };
}

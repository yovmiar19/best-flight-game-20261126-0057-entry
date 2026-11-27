// fx.js — Particle bursts, wingtip contrails, wind streaks, glow sprites.
// Fresh write from polish-spec.md §5 + §6.
import * as THREE from 'three';

export function makeGlowTexture(inner, outer) {
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

// ---- Particle burst pool (ring pass) ----
export function createBursts(scene) {
  const pool = [];
  for (let i = 0; i < 6; i++) {
    const geo = new THREE.BufferGeometry();
    const N = 60;
    const posArr = new Float32Array(N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffd700, size: 1.6, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    scene.add(pts);
    pool.push({ pts, vel: new Float32Array(N * 3), life: 0, N });
  }
  let next = 0;
  return {
    burst(pos, color) {
      const b = pool[next++ % pool.length];
      const arr = b.pts.geometry.attributes.position.array;
      for (let i = 0; i < b.N; i++) {
        arr[i * 3] = pos.x; arr[i * 3 + 1] = pos.y; arr[i * 3 + 2] = pos.z;
        const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        const sp = 12 + Math.random() * 18;
        b.vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
        b.vel[i * 3 + 1] = Math.cos(ph) * sp;
        b.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.color.setHex(color || 0xffd700);
      b.pts.material.opacity = 1;
      b.pts.visible = true;
      b.life = 1;
    },
    update(dt) {
      for (const b of pool) {
        if (b.life <= 0) continue;
        b.life -= dt * 1.4;
        if (b.life <= 0) { b.pts.visible = false; continue; }
        const arr = b.pts.geometry.attributes.position.array;
        for (let i = 0; i < b.N; i++) {
          arr[i * 3] += b.vel[i * 3] * dt;
          arr[i * 3 + 1] += b.vel[i * 3 + 1] * dt;
          arr[i * 3 + 2] += b.vel[i * 3 + 2] * dt;
          b.vel[i * 3 + 1] -= 6 * dt;
        }
        b.pts.geometry.attributes.position.needsUpdate = true;
        b.pts.material.opacity = Math.max(0, b.life);
      }
    },
  };
}

// ---- Wingtip contrails: two fading ribbons anchored at the wingtips ----
export function createContrails(scene) {
  const trails = [];
  for (let i = 0; i < 2; i++) {
    const N = 40;
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    trails.push({ line, pts: [], N });
  }
  return {
    update(planeGroup, speed) {
      for (let t = 0; t < 2; t++) {
        const tr = trails[t];
        const side = t === 0 ? -5.4 : 5.4;
        const tip = new THREE.Vector3(side, 0.1, 0.4).applyMatrix4(planeGroup.matrixWorld);
        tr.pts.unshift(tip.clone());
        if (tr.pts.length > tr.N) tr.pts.pop();
        const arr = tr.line.geometry.attributes.position.array;
        for (let i = 0; i < tr.N; i++) {
          const p = tr.pts[Math.min(i, tr.pts.length - 1)] || tip;
          arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
        }
        tr.line.geometry.attributes.position.needsUpdate = true;
        tr.line.material.opacity = speed > 25 ? 0.45 : 0.12;
        tr.line.visible = speed > 8;
      }
    },
    reset() { for (const tr of trails) tr.pts = []; },
  };
}

// ---- Wind streaks: ~60 short white streaks streaming past the camera ----
export function createWindStreaks(scene) {
  const N = 60;
  const geo = new THREE.BufferGeometry();
  const posArr = new Float32Array(N * 2 * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  scene.add(lines);
  const seeds = [];
  for (let i = 0; i < N; i++) {
    seeds.push({
      x: (Math.random() - 0.5) * 60, y: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 60,
    });
  }
  return {
    update(camera, speed, dt) {
      const vis = speed > 35;
      mat.opacity = vis ? Math.min(0.5, (speed - 35) / 40) : 0;
      if (!vis) { lines.visible = false; return; }
      lines.visible = true;
      const arr = geo.attributes.position.array;
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const back = speed * dt * 2.2;
      for (let i = 0; i < N; i++) {
        const s = seeds[i];
        s.z += back; // stream backward relative to flight
        if (s.z > 30) { s.z = -30; s.x = (Math.random() - 0.5) * 60; s.y = (Math.random() - 0.5) * 30; }
        const cx = camera.position.x + right.x * s.x + up.x * s.y + fwd.x * s.z;
        const cy = camera.position.y + right.y * s.x + up.y * s.y + fwd.y * s.z;
        const cz = camera.position.z + right.z * s.x + up.z * s.y + fwd.z * s.z;
        arr[i * 6] = cx; arr[i * 6 + 1] = cy; arr[i * 6 + 2] = cz;
        arr[i * 6 + 3] = cx - fwd.x * 3; arr[i * 6 + 4] = cy - fwd.y * 3; arr[i * 6 + 5] = cz - fwd.z * 3;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

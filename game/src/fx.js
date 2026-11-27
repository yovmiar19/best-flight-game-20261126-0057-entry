// fx.js — Island Hopper v3: particle burst, wind streaks, wingtip trails, spec §2.6.
// No FOV punch anywhere (that was POV, discarded in v3).

const THREE = window.THREE;

export function createFx(scene) {
  // --- Ring burst: one reusable Points cloud, re-fired per pass ---
  const MAXP = 220;
  const positions = new Float32Array(MAXP * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const burstMat = new THREE.PointsMaterial({
    color: 0xffd166, size: 1.6, transparent: true, opacity: 0, depthWrite: false,
  });
  const burst = new THREE.Points(geo, burstMat);
  burst.frustumCulled = false;
  scene.add(burst);
  const vel = new Float32Array(MAXP * 3);
  let burstLife = 0;

  function fireBurst(center) {
    for (let i = 0; i < MAXP; i++) {
      positions[i * 3] = center.x;
      positions[i * 3 + 1] = center.y;
      positions[i * 3 + 2] = center.z;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const sp = 14 + Math.random() * 26;
      vel[i * 3] = Math.cos(a) * Math.cos(b) * sp;
      vel[i * 3 + 1] = Math.sin(b) * sp;
      vel[i * 3 + 2] = Math.sin(a) * Math.cos(b) * sp;
    }
    geo.attributes.position.needsUpdate = true;
    burstLife = 1;
    burstMat.opacity = 1;
  }

  // --- Wind streaks: short line segments rushing past the camera at speed ---
  const STREAKS = 26;
  const streakGeo = new THREE.BufferGeometry();
  const streakPos = new Float32Array(STREAKS * 6);
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  const streaks = new THREE.LineSegments(
    streakGeo,
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
  );
  streaks.frustumCulled = false;
  scene.add(streaks);
  const streakData = [];
  for (let i = 0; i < STREAKS; i++) {
    streakData.push({
      x: (Math.random() - 0.5) * 40, y: (Math.random() - 0.5) * 24, z: (Math.random() - 0.5) * 40,
    });
  }

  // --- Wingtip trails: fading line strips behind both wingtips ---
  const TRAIL_N = 28;
  const trailGeoL = new THREE.BufferGeometry();
  const trailPosL = new Float32Array(TRAIL_N * 3);
  trailGeoL.setAttribute('position', new THREE.BufferAttribute(trailPosL, 3));
  const trailMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
  const trailL = new THREE.Line(trailGeoL, trailMat.clone());
  const trailR = new THREE.Line(trailGeoL.clone(), trailMat.clone());
  trailL.frustumCulled = trailR.frustumCulled = false;
  scene.add(trailL, trailR);
  const histL = [], histR = [];
  for (let i = 0; i < TRAIL_N; i++) { histL.push(null); histR.push(null); }
  let trailsSeeded = false;

  function writeTrail(hist, attr) {
    for (let i = 0; i < TRAIL_N; i++) {
      attr.array[i * 3] = hist[i][0];
      attr.array[i * 3 + 1] = hist[i][1];
      attr.array[i * 3 + 2] = hist[i][2];
    }
    attr.needsUpdate = true;
  }

  return {
    fireBurst,
    update(state, plane, camera, dt, t) {
      // Burst
      if (burstLife > 0) {
        burstLife -= dt * 1.4;
        for (let i = 0; i < MAXP; i++) {
          positions[i * 3] += vel[i * 3] * dt;
          positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
          positions[i * 3 + 2] += vel[i * 3 + 2] * dt;
          vel[i * 3 + 1] -= dt * 6;
        }
        geo.attributes.position.needsUpdate = true;
        burstMat.opacity = Math.max(0, burstLife);
      }
      // Streaks: only at high speed, rushing from front to back past camera
      const speedFrac = state.speed / 62;
      const show = !state.onGround && speedFrac > 0.55;
      streaks.material.opacity = show ? (speedFrac - 0.55) * 0.9 : 0;
      if (show) {
        const camPos = camera.position;
        for (let i = 0; i < STREAKS; i++) {
          const s = streakData[i];
          s.z += (30 + state.speed) * dt;
          if (s.z > 22) { s.z = -22; s.x = (Math.random() - 0.5) * 40; s.y = (Math.random() - 0.5) * 24; }
          streakPos[i * 6] = camPos.x + s.x;
          streakPos[i * 6 + 1] = camPos.y + s.y;
          streakPos[i * 6 + 2] = camPos.z + s.z;
          streakPos[i * 6 + 3] = camPos.x + s.x;
          streakPos[i * 6 + 4] = camPos.y + s.y;
          streakPos[i * 6 + 5] = camPos.z + s.z + 3.5;
        }
        streakGeo.attributes.position.needsUpdate = true;
      }
      // Wingtip trails: track the two wingtip world positions.
      // Seed the history with the current tips on first use so no line is
      // ever drawn back to the world origin.
      const tipL = new THREE.Vector3(-5.4, 0.05, 0.2);
      const tipR = new THREE.Vector3(5.4, 0.05, 0.2);
      plane.group.localToWorld(tipL);
      plane.group.localToWorld(tipR);
      if (!trailsSeeded) {
        for (let i = 0; i < TRAIL_N; i++) {
          histL[i] = [tipL.x, tipL.y, tipL.z];
          histR[i] = [tipR.x, tipR.y, tipR.z];
        }
        trailsSeeded = true;
      }
      const flying = !state.onGround && state.speed > 20;
      histL.pop(); histL.unshift([tipL.x, tipL.y, tipL.z]);
      histR.pop(); histR.unshift([tipR.x, tipR.y, tipR.z]);
      writeTrail(histL, trailGeoL.attributes.position);
      writeTrail(histR, trailR.geometry.attributes.position);
      trailL.material.opacity = flying ? 0.35 : 0;
      trailR.material.opacity = flying ? 0.35 : 0;
    },
  };
}

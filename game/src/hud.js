// hud.js — the instrument overlay: altitude, speed, heading, fuel, score, mission.
// One clear job: turn flight state into DOM text, and flash banners.

const $ = (id) => document.getElementById(id);

function compass(heading) {
  const deg = ((Math.round((-heading * 180) / Math.PI) % 360) + 360) % 360;
  return String(deg).padStart(3, '0');
}

/** Build the HUD elements inside #hud and return handles. */
export function buildHud() {
  const hud = $('hud');
  hud.innerHTML = `
    <div class="panel" id="hud-left">
      <div class="row"><span>ALT</span><b id="hud-alt">0 m</b></div>
      <div class="row"><span>SPD</span><b id="hud-spd">0 km/h</b></div>
      <div class="row"><span>HDG</span><b id="hud-hdg">000°</b></div>
      <div class="row"><span>THR</span><div class="bar"><i id="hud-thr"></i></div></div>
      <div class="row"><span>FUEL</span><div class="bar fuel"><i id="hud-fuel"></i></div></div>
    </div>
    <div class="panel" id="hud-right">
      <div class="row"><span>SCORE</span><b id="hud-score">0</b></div>
      <div class="row"><span>RINGS</span><b id="hud-rings">0 / 8</b></div>
      <div class="row"><span>TIME</span><b id="hud-time">0:00</b></div>
      <div class="row"><span>DMG</span><b id="hud-dmg">▢▢▢</b></div>
    </div>
    <div id="hud-mission">Fly through all 8 glowing rings, then land on the runway.</div>
    <div id="hud-warn"></div>
    <div id="hud-banner"></div>
  `;
  return {
    alt: $('hud-alt'),
    spd: $('hud-spd'),
    hdg: $('hud-hdg'),
    thr: $('hud-thr'),
    fuel: $('hud-fuel'),
    score: $('hud-score'),
    rings: $('hud-rings'),
    time: $('hud-time'),
    dmg: $('hud-dmg'),
    mission: $('hud-mission'),
    warn: $('hud-warn'),
    banner: $('hud-banner'),
  };
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Refresh every HUD field from the flight state. Cheap: only writes when changed. */
export function updateHud(handles, state, nextRingLabel) {
  const alt = Math.max(0, Math.round(state.pos.y));
  const spd = Math.round(state.speed * 3.6);
  const hdg = compass(state.heading);
  const time = formatTime(state.time);
  const dmg = '▣'.repeat(state.damage) + '▢'.repeat(Math.max(0, 3 - state.damage));
  const set = (el, value) => {
    if (el.textContent !== value) el.textContent = value;
  };
  set(handles.alt, `${alt} m`);
  set(handles.spd, `${spd} km/h`);
  set(handles.hdg, `${hdg}°`);
  set(handles.score, String(state.score));
  set(handles.rings, `${state.ringsFlown} / 8`);
  set(handles.time, time);
  set(handles.dmg, dmg);
  handles.thr.style.width = `${Math.round(state.throttle * 100)}%`;
  handles.fuel.style.width = `${Math.round(state.fuel)}%`;
  handles.fuel.parentElement.classList.toggle('low', state.fuel < 25);

  const warnings = [];
  if (state.stalled) warnings.push('⚠ STALL — NOSE DOWN, ADD THROTTLE');
  if (state.fuel < 25 && state.fuel > 0) warnings.push('⚠ LOW FUEL — LAND ON THE RUNWAY');
  if (state.fuel === 0) warnings.push('⚠ FUEL EMPTY — GLIDING');
  if (state.damage > 0) warnings.push(`⚠ DAMAGE ${state.damage}/3 — LAND TO REPAIR`);
  set(handles.warn, warnings.join('  ·  '));
  handles.warn.style.display = warnings.length ? 'block' : 'none';

  if (state.ringsFlown >= 8) {
    set(handles.mission, `MISSION COMPLETE — all 8 rings in ${time}! Land on the runway to finish.`);
  } else {
    set(handles.mission, `Next ring: ${nextRingLabel}  ·  ${state.ringsFlown} of 8 flown`);
  }
}

/** Show a big centre banner for a few seconds (longer in staged screenshot scenes). */
export function showBanner(handles, text, kind = '', durationMs = 2600) {
  handles.banner.textContent = text;
  handles.banner.className = `show ${kind}`;
  clearTimeout(showBanner.timer);
  showBanner.timer = setTimeout(() => {
    handles.banner.className = '';
  }, durationMs);
}
showBanner.timer = 0;

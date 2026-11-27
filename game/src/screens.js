// screens.js — State machine TITLE -> BRIEFING -> FLYING -> LANDED / CRASHED.
// Fresh write from polish-spec.md §4. Attract mode flies the Tomcat itself.
import { medalFor, starsFor, fmtTime, loadBest, saveBest, BEST_KEY } from './missions.js';

export const SCREENS = { TITLE: 'TITLE', BRIEFING: 'BRIEFING', FLYING: 'FLYING', LANDED: 'LANDED', CRASHED: 'CRASHED' };

export function createScreens(doc, hooks) {
  const el = (id) => doc.getElementById(id);
  const s = {
    screen: SCREENS.TITLE,
    crashTimer: 0,
    crashCount: 0,
    attractAngle: 0,
    hooks,
    els: {
      overlay: el('overlay'),
      titleCard: el('card-title'),
      briefCard: el('card-briefing'),
      crashCard: el('card-crash'),
      resultsCard: el('card-results'),
      crashText: el('crash-text'),
      crashCount: el('crash-count'),
      resTime: el('res-time'), resRings: el('res-rings'), resFuel: el('res-fuel'),
      resGrade: el('res-grade'), resScore: el('res-score'), resMedal: el('res-medal'),
      resStars: el('res-stars'), resBest: el('res-best'),
    },
  };

  function showOnly(card) {
    for (const k of ['titleCard', 'briefCard', 'crashCard', 'resultsCard']) {
      const c = s.els[k];
      if (c) c.style.display = (k === card) ? 'block' : 'none';
    }
    if (s.els.overlay) s.els.overlay.style.display = card ? 'flex' : 'none';
  }

  s.toTitle = function () {
    s.screen = SCREENS.TITLE;
    showOnly('titleCard');
    if (hooks.onTitle) hooks.onTitle();
  };
  s.toBriefing = function () {
    s.screen = SCREENS.BRIEFING;
    showOnly('briefCard');
    if (hooks.onBriefing) hooks.onBriefing();
  };
  s.toFlying = function () {
    const prev = s.screen;
    s.screen = SCREENS.FLYING;
    showOnly(null);
    if (hooks.onFly) hooks.onFly(prev);
  };
  s.toCrashed = function (reason, damage) {
    s.screen = SCREENS.CRASHED;
    s.crashTimer = 3;
    s.crashCount = damage;
    if (s.els.crashText) {
      s.els.crashText.textContent = reason === 'water' ? 'Ditched in the sea!' : reason === 'hard-landing' ? 'Hard landing — airframe damaged!' : 'Crashed into terrain!';
    }
    if (s.els.crashCount) s.els.crashCount.textContent = 'Hits ' + damage + '/3';
    showOnly('crashCard');
    if (hooks.onCrash) hooks.onCrash(reason);
  };
  s.toLanded = function (state) {
    s.screen = SCREENS.LANDED;
    const medal = medalFor(state.score, state.damage);
    const stars = starsFor(state.ringsFlown, state.time, state.damage, state.grade);
    saveBest(state.time);
    const best = loadBest();
    if (s.els.resTime) s.els.resTime.textContent = fmtTime(state.time);
    if (s.els.resRings) s.els.resRings.textContent = state.ringsFlown + '/8';
    if (s.els.resFuel) s.els.resFuel.textContent = Math.round(state.fuel) + '%';
    if (s.els.resGrade) s.els.resGrade.textContent = state.grade || '—';
    if (s.els.resScore) s.els.resScore.textContent = String(state.score);
    if (s.els.resMedal) s.els.resMedal.textContent = medal;
    if (s.els.resStars) s.els.resStars.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    if (s.els.resBest) s.els.resBest.textContent = best != null ? 'BEST ' + fmtTime(best) : 'BEST —';
    showOnly('resultsCard');
    if (hooks.onFinish) hooks.onFinish(state, medal, stars);
  };

  // Any key / click / tap advances TITLE -> BRIEFING -> FLYING.
  s.advance = function () {
    if (s.screen === SCREENS.TITLE) s.toBriefing();
    else if (s.screen === SCREENS.BRIEFING) s.toFlying();
  };

  // Attract-mode autopilot: constant speed 40, altitude ~60, slow turn.
  // Returns the desired {heading, pitch} for the plane.
  s.attractStep = function (state, dt) {
    s.attractAngle += dt * 0.08;
    const cx = 0, cz = -100;
    const tx = cx + Math.cos(s.attractAngle) * 420;
    const tz = cz + Math.sin(s.attractAngle) * 420;
    const wantHeading = Math.atan2(tx - state.pos.x, -(tz - state.pos.z));
    let dh = wantHeading - state.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    state.heading += Math.max(-0.25 * dt, Math.min(0.25 * dt, dh));
    state.roll = Math.max(-0.5, Math.min(0.5, dh * 1.2));
    const wantAlt = 60;
    state.pitch = Math.max(-0.15, Math.min(0.15, (wantAlt - state.pos.y) * 0.01));
    state.speed = 40;
    state.throttle = 0.6;
    state.pos.x += Math.sin(state.heading) * Math.cos(state.pitch) * state.speed * dt;
    state.pos.y += Math.sin(state.pitch) * state.speed * dt;
    state.pos.z -= Math.cos(state.heading) * Math.cos(state.pitch) * state.speed * dt;
    return s.attractAngle;
  };

  // Crash countdown tick; returns true when the 3 s are up.
  s.tickCrash = function (dt) {
    if (s.screen !== SCREENS.CRASHED) return false;
    s.crashTimer -= dt;
    const card = s.els.crashCard;
    if (card) {
      const n = card.querySelector('.crash-countdown');
      if (n) n.textContent = 'Respawning in ' + Math.max(0, Math.ceil(s.crashTimer)) + '…';
    }
    if (s.crashTimer <= 0) {
      if (hooks.onRespawn) hooks.onRespawn();
      s.toFlying();
      return true;
    }
    return false;
  };

  s.toTitle();
  return s;
}

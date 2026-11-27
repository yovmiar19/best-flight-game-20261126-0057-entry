// screens.js — Island Hopper v3: title / briefing / results / crash cards.
// Flow per spec §1.5 (v1 state machine); results content per §2.5.

export function createScreens() {
  const $ = (id) => document.getElementById(id);
  const cards = {
    title: $('card-title'),
    briefing: $('card-briefing'),
    results: $('card-results'),
    crash: $('card-crash'),
  };
  const crashTimer = $('crash-timer');

  function showOnly(name) {
    for (const [k, c] of Object.entries(cards)) {
      if (c) c.classList.toggle('show', k === name);
    }
  }

  return {
    showTitle() { showOnly('title'); },
    showBriefing() { showOnly('briefing'); },
    showFlying() { showOnly(null); },
    showCrash() { showOnly('crash'); },
    setCrashCountdown(sec) { if (crashTimer) crashTimer.textContent = String(Math.ceil(sec)); },
    showResults(state) {
      showOnly('results');
      const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
      const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      // Stars: 3 if time < 300 and no damage, 2 if rings all + landed, else 1
      let stars = 1;
      if (state.time < 420 && state.damage === 0) stars = 3;
      else if (state.time < 600 || state.damage === 0) stars = 2;
      const medal = stars === 3 ? 'GOLD' : stars === 2 ? 'SILVER' : 'BRONZE';
      set('res-stars', '★'.repeat(stars) + '☆'.repeat(3 - stars));
      set('res-medal', medal);
      const medalEl = $('res-medal');
      if (medalEl) medalEl.className = `medal ${medal.toLowerCase()}`;
      set('res-time', fmtTime(state.time));
      set('res-rings', `${state.ringsFlown}/8`);
      set('res-fuel', `${Math.round(state.fuel)}%`);
      set('res-landing', state.lastLanding ? state.lastLanding.grade : '—');
      set('res-score', String(state.score));
      // Best time in localStorage
      let best = null;
      try {
        best = Number(localStorage.getItem('island-hopper-best-time') || '0');
        if (!best || state.time < best) {
          localStorage.setItem('island-hopper-best-time', String(Math.round(state.time)));
          best = state.time;
        }
      } catch (e) { best = state.time; }
      set('res-best', fmtTime(best || state.time));
    },
  };
}

// screens.js — the game-state machine and its full-screen cards.
// One clear job: TITLE -> BRIEFING -> FLYING -> LANDED (results) / CRASHED (respawn).

export const SCREENS = {
  TITLE: 'title',
  BRIEFING: 'briefing',
  FLYING: 'flying',
  LANDED: 'landed',
  CRASHED: 'crashed',
};

const $ = (id) => document.getElementById(id);

/** Medal from final score and damage: Gold needs a fast, clean, full run. */
export function medalFor(score, damage) {
  if (score >= 3200 && damage === 0) return 'GOLD';
  if (score >= 2200) return 'SILVER';
  return 'BRONZE';
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Show exactly one overlay card (or none while flying).
 * `name` is 'title' | 'briefing' | 'results' | 'crash' | null.
 */
export function showCard(name) {
  const overlay = $('overlay');
  for (const id of ['title-card', 'briefing-card', 'results-card', 'crash-card']) {
    $(id).classList.toggle('hidden', id !== `${name}-card`);
  }
  overlay.classList.toggle('hidden', name === null);
  overlay.classList.toggle('crash-tint', name === 'crash');
}

/** Fill the results card from the finished flight and show it. */
export function showResults(state) {
  const grade = state.lastLanding ? state.lastLanding.grade : '—';
  $('res-time').textContent = formatTime(state.time);
  $('res-rings').textContent = `${state.ringsFlown} / 8`;
  $('res-fuel').textContent = `${Math.round(state.fuel)}%`;
  $('res-landing').textContent = grade;
  $('res-score').textContent = String(state.score);
  const medal = medalFor(state.score, state.damage);
  const medalEl = $('res-medal');
  medalEl.textContent = `🏅 ${medal} MEDAL`;
  medalEl.className = `medal ${medal.toLowerCase()}`;
  showCard('results');
}

/** Fill the crash card with the hit count and a respawn countdown value. */
export function showCrash(state, secondsLeft) {
  $('crash-hits').textContent = `${Math.min(3, state.damage)}/3 hits`;
  $('crash-count').textContent = `Respawning in ${secondsLeft}…`;
  showCard('crash');
}

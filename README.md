# Island Hopper

[![Island Hopper](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/yovmiar19/best-flight-game-20261126-0057-entry/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/yovmiar19/best-flight-game-20261126-0057-entry/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

Fly an F-14D Tomcat across a golden-hour island archipelago. Thread all 8 rings in order, grab fuel canisters, and butter the landing back on Karimbu runway.

## How to play

- **W / S** — throttle up / down
- **↑ / ↓** — climb / dive (ArrowUp climbs — the v1 feel, restored in v3)
- **← / →** — bank left / right
- **Mouse drag** — look around · **R** — reset to runway · **M** — mute · **Enter** — continue

Take off from the runway once you pass 18 m/s and pull up. Each ring pays **100 × ring number** (ring 1 = +100 … ring 8 = +800), with a combo multiplier. A smooth runway landing refuels and repairs the jet; three hard hits and you crash (+30 s penalty, fresh plane on the runway, score and rings kept).

## What's inside

- **F-14D Tomcat** with animated variable-sweep wings (spread at low speed, swept at high speed), twin canted tails, bubble canopy, twin engines with afterburner glow and flame, and damage smoke.
- **Golden-hour world**: gradient sky dome, low warm sun with soft shadows, animated sea with shoreline foam, six islands (including the smoking Bara volcano), drifting low-poly clouds, and a lit runway on Karimbu.
- **Trim HUD**: speed/altitude/fuel left, score/rings/time right, objective line, edge arrow + distance to the next ring, minimap, stall warning, and a red damage vignette.
- **WebAudio**: engine + wind that follow throttle and speed, rising ring chimes per combo, crash thud, landing chirp, and a soft pad loop.
- **Effects**: ring light beams, pulse + flash on pass, particle bursts, wind streaks at high speed, wingtip trails.

## Tech

Plain static files — `game/index.html` plus ES modules under `game/src/`, Three.js vendored in `game/vendor/`. No network requests, no build step. Serve `game/` with any static server and open it in a desktop browser.

## Screenshots

Staging shots (`?shot=title|ringpass|landing|results|beach|runway|ring|cover`) are built into the game for reproducible captures.

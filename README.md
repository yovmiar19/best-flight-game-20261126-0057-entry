# Island Hopper

[![bounty](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/yovmiar19/best-flight-game-20261126-0057-entry/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/yovmiar19/best-flight-game-20261126-0057-entry/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A 3D low-poly flight game built with Three.js. Fly a small prop plane over a
tropical island chain at sunset, thread all 8 glowing target rings, and land
back on the runway to refuel and repair.

## How to play

Open `game/index.html` in a browser (or serve `game/` with any static server)
and click **CLICK TO FLY**.

| Key | Action |
| --- | --- |
| Arrow Up / Down | Pitch down / up |
| Arrow Left / Right | Bank and turn |
| W / S | Throttle up / down |
| R | Reset to the runway |
| Mouse drag | Look around (camera orbit, resets on release) |

## The mission

- **8 target rings** hang over the islands — fly through each one for +100 points.
- **Fuel** drains with throttle. Empty tank means a forced glide: land or crash.
- **Damage:** a hard landing or a rough field costs a hit; 3 hits crash the plane.
  A crash respawns you at the runway with your score and rings kept, plus a
  30-second time penalty.
- **Landing on the runway** refuels to 100% and repairs all damage.
- Fly below minimum speed and the nose drops — watch the stall warning on the HUD.
- Fly all 8 rings and the mission-complete banner shows your total time.

## Layout

- `game/index.html` — page, import map for Three.js, HUD and start screen.
- `game/src/main.js` — boot, render loop, chase camera, screenshot scenes.
- `game/src/terrain.js` — islands, volcano, runway, sea, clouds, sun, fog.
- `game/src/plane.js` — the prop plane model and its animation.
- `game/src/physics.js` — flight model, fuel, damage, crashes, respawn.
- `game/src/input.js` — keyboard + mouse-drag look.
- `game/src/hud.js` — altitude, speed, heading, throttle, fuel, score, banners.
- `game/src/missions.js` — the 8 rings, scoring, refuel and repair.
- `game/src/audio.js` — tiny synthesized WebAudio engine hum and chimes.
- `game/vendor/three.min.js` — vendored Three.js (r160), no network at runtime.
- `screenshots/` — real renders of the game running in a browser.

## Tech notes

- Static files only, no build step, no network at runtime.
- `main.ts` (Node 22, stdlib only) copies `game/` and `screenshots/` into
  `/output` and writes `dossier.json` with the kit's `buildDossier`.

## License

MIT — see `LICENSE`.

# Island Hopper — 3D Flight Game

[![Bounty](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/yovmiar19/best-flight-game-20261126-0057-entry/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/yovmiar19/best-flight-game-20261126-0057-entry/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

Fly an **F-14D Tomcat** through 8 golden rings across a tropical archipelago at golden hour, then land on the Karimbu runway. Entry for the [best-flight-game-20261126-0057](https://make.fun/bounty/best-flight-game-20261126-0057) bounty ($500, top 50).

## How to play

- **Arrows** — pitch and bank (banking turns the plane)
- **W/S** — throttle up / down
- **R** — reset to the runway · **M** — mute · **Mouse drag** — look around
- **Touch** — left stick to steer, right slider for throttle
- **Gamepad** — left stick to steer, right trigger for throttle

You start in the air, already flying toward ring 1. Each ring pays **100 × combo** and refills **+15% fuel**. Grab the yellow fuel canisters (+45%). Land butter-smooth for **+500**, firm for **+200** — a hard landing damages the airframe. Three hits and you crash, but you respawn in the air with 2 seconds of invulnerability.

Finish all 8 rings and land to earn up to **3 stars** and a medal (GOLD ≥ 3200 with no damage, SILVER ≥ 2200, else BRONZE). Your best time is saved locally.

## The Tomcat

A full F-14D model built from primitives: variable-sweep wings that swing from 20° extended at low speed to 68° swept at full throttle, twin canted tails, twin engines with afterburner glow and flame cones, bubble canopy, and landing gear. No propeller — this is a jet.

## The world

Six islands (Karimbu, Solmar, volcanic Bara, Nusa, Kecil, Terapung), a marked runway, animated sea with foam rings, 40 drifting low-poly clouds, volcano smoke, and golden-hour lighting with ACES tone mapping, a gradient sky dome, and soft shadows that follow the plane.

## Tech

- Three.js r160 (vendored single-file build under `game/vendor/`)
- Plain ES modules, no build step, no network requests — runs fully offline
- WebAudio engine hum, wind noise, rising-pitch ring chimes, landing chirps, and a quiet music pad (all synthesized, no audio files)

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000/game/
```

Build the dossier (what the judge reads):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).

# Brick Breaker DX 🧱

A polished neon-arcade brick breaker for the family — 30 campaign levels, 10
brick types, 16 stackable power-ups, a combo system, three boss battles and a
permanent upgrade shop.

**Play it:** https://rvenning.github.io/brick-breaker/

## Features

- **Classic Campaign** — 30 levels across 3 neon worlds; every 10th level is a
  boss fight (Brick Golem, UFO, Lava Core), structured so future modes
  (Endless, Boss Rush) slot in as data.
- **10 brick types** from a data registry ([js/bricks.js](js/bricks.js)):
  standard, strong, tough, steel, explosive, mystery, portal, frozen, fire,
  bomb, crystal — a new type is one new entry.
- **16 power-ups** from a component registry ([js/powerups.js](js/powerups.js)):
  lasers, fireball, triple/multiball, sticky/wide/giant/magnet paddle, bottom
  shield, and six ball modifiers. Timed effects stack by extending their timer.
- **Combo system** — consecutive bricks before the next paddle touch multiply
  score ×2/×5/×10/×20 with escalating particles and sound.
- **Permanent upgrades** — coins from levels buy data-driven upgrades
  ([js/upgrades.js](js/upgrades.js)): extra lives, paddle size, drop chance,
  score boost, laser start, mega multiball, rare finder.
- **Juice** — pooled particles, screen shake, ball trails, floating score text,
  hit flashes, slow-mo on boss kills, squashy paddle, synthesized layered audio.
- Family profiles with PINs, a shared leaderboard, and cross-device sync.

## Level format

Levels are 12-column grid strings in [js/levels.js](js/levels.js) — one
character per brick cell (`.` = empty, `1`/`2`/`3` = 1–3-hit bricks, `X` steel,
`E` explosive, `?` mystery, `P` portal, `F` frozen, `H` fire, `B` bomb,
`C` crystal). Boss levels are `{ name, boss: "golem" }`. Difficulty (ball
speed, ramp, drop rate) defaults from the level index and can be overridden
per level with `params`.

## Built on gamekit

Storage/family sync, profiles + PINs, WebAudio synth, screens/modals and PWA
install come from [gamekit](https://github.com/rvenning/gamekit), vendored
into `lib/`. Re-vendor after a kit change:

```
$env:Path += ';C:\Program Files\nodejs'
node "..\gamekit\tools\sync-to-game.js" "..\brick-breaker"
```

## PWA

`manifest.json` + `sw.js` (network-first cache, bump `CACHE` on shell changes)
+ `icons/` (regenerate with `node tools/make-icons.js`).

## Local development

```
$env:Path += ';C:\Program Files\nodejs'
npx http-server "D:\OneDrive\Documents\Claude Code\brick-breaker" -p 8101 -c-1
```

Tests (data linter for every level grid, physics helpers, merge safety):

```
npm test
```

## Storage

localStorage keys prefixed `bb_`; family sync in the `brickbreaker` Firestore
collection of the shared `wordvoyage-e5a5c` project (the public API key is
restricted and safe to commit). Coins are stored as monotonic
`coinsEarned`/`coinsSpent` counters so cross-device merges can take `max()`
of each without resurrecting spent coins.

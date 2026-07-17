// Brick type registry — the single place a brick type is defined.
// A level grid character maps to one entry here; adding a new brick type is
// one new entry (plus a character to use in js/levels.js).
//
// Entry shape:
//   name          display name
//   hp            hits to destroy (Infinity = indestructible)
//   score         base score when destroyed
//   counts        counts toward level completion (default: !indestructible)
//   drop          "always" | "never" | undefined (normal chance)
//   colors        [base, glow] used by the renderer
//   glyph         optional emoji/char drawn on the brick face
//   onHit(game, brick)      called on every hit that doesn't destroy it
//   onDestroy(game, brick)  called when it dies (explosions, ball effects…)
//
// Behaviors call back into small reusable game verbs (game.explodeAt,
// game.applyBallEffect, game.teleportBall) rather than embedding game logic.

const BRICKS = {
  "1": {
    name: "Standard", hp: 1, score: 50,
    colors: ["#38bdf8", "#7dd3fc"],
  },
  "2": {
    name: "Strong", hp: 2, score: 100,
    colors: ["#a78bfa", "#c4b5fd"],
  },
  "3": {
    name: "Tough", hp: 3, score: 150,
    colors: ["#f472b6", "#f9a8d4"],
  },
  "X": {
    name: "Steel", hp: Infinity, score: 0, counts: false, drop: "never",
    colors: ["#64748b", "#94a3b8"],
  },
  "E": {
    name: "Explosive", hp: 1, score: 120,
    colors: ["#fb923c", "#fdba74"], glyph: "✶",
    onDestroy(game, brick) { game.explodeAt(brick.cx, brick.cy, 1.5, brick); },
  },
  "?": {
    name: "Mystery", hp: 1, score: 80, drop: "always",
    colors: ["#facc15", "#fde047"], glyph: "?",
  },
  "P": {
    name: "Portal", hp: Infinity, score: 0, counts: false, drop: "never",
    colors: ["#2dd4bf", "#5eead4"], glyph: "◎", portal: true,
  },
  "F": {
    name: "Frozen", hp: 1, score: 90,
    colors: ["#7dd3fc", "#e0f2fe"], glyph: "❄",
    onDestroy(game) { game.applyTimedEffect("chill", 5); },
  },
  "H": {
    name: "Fire", hp: 1, score: 90,
    colors: ["#f87171", "#fca5a5"], glyph: "🔥",
    onDestroy(game) { game.applyTimedEffect("blaze", 5); },
  },
  "B": {
    name: "Bomb", hp: 2, score: 150,
    colors: ["#334155", "#f87171"], glyph: "💣",
    onHit(game, brick) { if (!brick.fuse) { brick.fuse = 1.4; game.sfxFuse(brick); } },
    onDestroy(game, brick) { game.explodeAt(brick.cx, brick.cy, 1.8, brick); },
  },
  "C": {
    name: "Crystal", hp: 1, score: 500,
    colors: ["#e879f9", "#f5d0fe"], glyph: "◆", sparkle: true,
  },
};

// Level-completion rule derived per type once.
for (const t of Object.values(BRICKS)) {
  if (t.counts === undefined) t.counts = t.hp !== Infinity;
}

if (typeof window === "undefined") { globalThis.BRICKS = BRICKS; }

// Power-up registry — component-based effects, not custom logic per drop.
//
// Entry shape:
//   name, icon, color   presentation (icon drawn on the falling capsule)
//   kind    "timed"   — tracked in game.effects[id] with a countdown;
//                       catching again extends the timer (stacks duration).
//           "instant" — apply() fires once.
//   dur     seconds for timed effects
//   weight  drop-table weight (higher = more common); "rare" upgrades scale
//           weights of entries marked rare:true.
//   apply(game) / expire(game)   optional hooks for instant work or cleanup.
//
// Most timed effects need NO hooks at all: the engine derives state from
// game.effects each frame (paddle width, ball speed/flags, laser timer), so a
// new timed power-up is usually just data.

const POWERUPS = {
  /* --- weapons --- */
  laser:     { name: "Laser",        icon: "⚡", color: "#f43f5e", kind: "timed", dur: 12, weight: 8 },
  fireball:  { name: "Fireball",     icon: "🔥", color: "#fb923c", kind: "timed", dur: 15, weight: 6, rare: true },
  triple:    { name: "Triple Ball",  icon: "3×", color: "#38bdf8", kind: "instant", weight: 8,
               apply(g) { g.splitBalls(3); } },
  multiball: { name: "Multiball",    icon: "6×", color: "#818cf8", kind: "instant", weight: 4, rare: true,
               apply(g) { g.spawnMultiball(); } },

  /* --- paddle --- */
  sticky:    { name: "Sticky Paddle", icon: "🍯", color: "#facc15", kind: "timed", dur: 14, weight: 7 },
  wide:      { name: "Wide Paddle",   icon: "↔",  color: "#4ade80", kind: "timed", dur: 14, weight: 10 },
  giant:     { name: "Giant Paddle",  icon: "⬌",  color: "#22d3ee", kind: "timed", dur: 10, weight: 4, rare: true },
  magnet:    { name: "Magnet",        icon: "🧲", color: "#c084fc", kind: "timed", dur: 16, weight: 7 },
  shield:    { name: "Shield",        icon: "🛡", color: "#2dd4bf", kind: "timed", dur: 30, weight: 6 },

  /* --- ball --- */
  fast:      { name: "Fast Ball",      icon: "»", color: "#fda4af", kind: "timed", dur: 10, weight: 6 },
  slow:      { name: "Slow Ball",      icon: "🐢", color: "#93c5fd", kind: "timed", dur: 10, weight: 8 },
  heavy:     { name: "Heavy Ball",     icon: "●", color: "#a8a29e", kind: "timed", dur: 12, weight: 6 },
  pierce:    { name: "Piercing Ball",  icon: "➤", color: "#f0abfc", kind: "timed", dur: 10, weight: 5, rare: true },
  explosive: { name: "Explosive Ball", icon: "✶", color: "#fb7185", kind: "timed", dur: 10, weight: 5, rare: true },
  electric:  { name: "Electric Ball",  icon: "⌁", color: "#fde047", kind: "timed", dur: 12, weight: 5, rare: true },
};

for (const [id, p] of Object.entries(POWERUPS)) p.id = id;

// Weighted pick from the drop table. rareBoost (from the permanent "rare
// power-ups" upgrade) multiplies the weight of rare entries.
function pickPowerup(rng, rareBoost = 1) {
  const entries = Object.values(POWERUPS);
  let total = 0;
  const w = entries.map(p => {
    const wt = p.weight * (p.rare ? rareBoost : 1);
    total += wt;
    return wt;
  });
  let roll = rng() * total;
  for (let i = 0; i < entries.length; i++) {
    roll -= w[i];
    if (roll <= 0) return entries[i];
  }
  return entries[entries.length - 1];
}

if (typeof window === "undefined") { globalThis.POWERUPS = POWERUPS; globalThis.pickPowerup = pickPowerup; }

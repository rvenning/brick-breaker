// Permanent upgrade definitions — pure data. The shop screen, the cost curve
// and the in-game effect lookups are all driven from this table; adding an
// upgrade is one new entry plus reading its value where it applies
// (via upgradeValue(progress, id)).
//
//   costs   coin price per level (length = max level)
//   value   per-level effect value, same length as costs (value[level-1])
//   fmt     renders a value for the shop card

const UPGRADES = [
  { id: "life",   name: "Extra Life",     icon: "❤️",
    desc: "Start every level with more lives",
    costs: [200, 600], value: [1, 2], fmt: v => `+${v} life` },
  { id: "paddle", name: "Bigger Paddle",  icon: "🏓",
    desc: "Permanently widen your paddle",
    costs: [120, 300, 700], value: [1.08, 1.16, 1.25], fmt: v => `×${v} width` },
  { id: "drops",  name: "Lucky Drops",    icon: "🎁",
    desc: "Bricks drop power-ups more often",
    costs: [150, 400, 900], value: [1.2, 1.4, 1.65], fmt: v => `×${v} drop chance` },
  { id: "score",  name: "Score Boost",    icon: "⭐",
    desc: "Earn more points from every brick",
    costs: [150, 400, 900], value: [1.1, 1.2, 1.35], fmt: v => `×${v} score` },
  { id: "laserstart", name: "Laser Start", icon: "⚡",
    desc: "Begin every level with 8s of lasers",
    costs: [800], value: [8], fmt: v => `${v}s of laser` },
  { id: "multi",  name: "Mega Multiball", icon: "🟣",
    desc: "Multiball spawns extra balls",
    costs: [350, 800], value: [2, 4], fmt: v => `+${v} balls` },
  { id: "rare",   name: "Rare Finder",    icon: "💎",
    desc: "Rare power-ups appear more often",
    costs: [300, 700], value: [1.6, 2.4], fmt: v => `×${v} rare weight` },
];

// Effect value for a profile's current upgrade level (fallback = no upgrade).
function upgradeValue(upgrades, id, fallback) {
  const def = UPGRADES.find(u => u.id === id);
  const lvl = (upgrades && upgrades[id]) || 0;
  if (!def || lvl <= 0) return fallback;
  return def.value[Math.min(lvl, def.value.length) - 1];
}

if (typeof window === "undefined") {
  globalThis.UPGRADES = UPGRADES;
  globalThis.upgradeValue = upgradeValue;
}

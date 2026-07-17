// Campaign level data — pure data, no logic. Add a level by adding an entry.
//
// Normal level: { name, rows, params? }
//   rows    array of 12-char strings; each char is a BRICKS key, "." = empty.
//   params  optional overrides: { speed, ramp, maxSpeed, drop }
//           speed    starting ball speed (logical px/s)
//           ramp     speed gained per second of play
//           maxSpeed speed cap
//           drop     power-up drop chance per destroyed brick
// Boss level: { name, boss: "golem" | "ufo" | "core", params? }
//
// Difficulty defaults scale with level index (see levelParams below), so most
// levels don't need params at all.

const GRID_COLS = 12;

const LEVELS = [
  /* ---------- world 1 ---------- */
  { name: "Warm-up", params: { speed: 220, drop: 0.3 }, rows: [
    "............",
    "..11....11..",
    ".1111..1111.",
    "..11....11..",
  ]},
  { name: "Stripes", rows: [
    "111111111111",
    "............",
    "222222222222",
    "............",
    "111111111111",
  ]},
  { name: "Checkers", rows: [
    "1.2.1.2.1.2.",
    ".2.1.2.1.2.1",
    "1.2.1.2.1.2.",
    ".2.1.2.1.2.1",
  ]},
  { name: "The Wall", rows: [
    "222222222222",
    "111111111111",
    "111111111111",
    "..1......1..",
  ]},
  { name: "Diamond", rows: [
    ".....11.....",
    "....1221....",
    "...122E221..",
    "....1221....",
    ".....11.....",
  ]},
  { name: "Lucky Dip", rows: [
    "1?1111111?11",
    "............",
    "11?11111?111",
    "............",
    "111?1111111?",
  ]},
  { name: "Fortress", rows: [
    "X1111111111X",
    "X.222222...X",
    "X.2?22?2...X",
    "X.222222...X",
    "X1111111111X",
  ]},
  { name: "Deep Freeze", rows: [
    "..F......F..",
    ".1111111111.",
    ".11F11F1111.",
    ".1111111111.",
    "..F......F..",
  ]},
  { name: "Hot & Cold", rows: [
    "HHH......FFF",
    "111111111111",
    "..1C1111C1..",
    "111111111111",
    "FFF......HHH",
  ]},
  { name: "Brick Golem", boss: "golem" },

  /* ---------- world 2 ---------- */
  { name: "Portal Party", rows: [
    "P....11....P",
    "..12211221..",
    "..12?11?21..",
    "..12211221..",
    "P....11....P",
  ]},
  { name: "Bomb Alley", rows: [
    "1111B..B1111",
    "2222.11.2222",
    "111B1111B111",
    "2222.11.2222",
    "1111B..B1111",
  ]},
  { name: "Pyramid", rows: [
    ".....22.....",
    "....2112....",
    "...211112...",
    "..21122112..",
    ".2111221112.",
    "211111111112",
  ]},
  { name: "Zigzag", rows: [
    "222.........",
    ".222........",
    "..222..C....",
    "...222......",
    "....222.....",
    ".....222....",
    "..C...222...",
    ".......222..",
    "........222.",
  ]},
  { name: "Crystal Cave", rows: [
    "X..........X",
    "X.11C11C11.X",
    "X.1XX22XX1.X",
    "X.1XC..C...X",
    "X.11111111.X",
    "X..........X",
  ]},
  { name: "Twin Towers", rows: [
    ".22......22.",
    ".2?2....2?2.",
    ".222....222.",
    ".2E2....2E2.",
    ".222....222.",
    ".222....222.",
  ]},
  { name: "Minefield", rows: [
    "1.E.1.1.E.1.",
    ".1.1.E.1.1.E",
    "E.1.1.1.1.1.",
    ".1.E.1.E.1.1",
    "1.1.1.1.1.E.",
  ]},
  { name: "The Vault", rows: [
    "...X....X...",
    "..XXECCEXX..",
    "..X2CCCC2X..",
    "..XXECCEXX..",
    "...X....X...",
    "111111111111",
  ]},
  { name: "Pandemonium", rows: [
    "2B211?112B22",
    "1F111HH111F1",
    "..3E1221E3..",
    "1H111FF111H1",
    "2B211?112B22",
  ]},
  { name: "Mothership", boss: "ufo" },

  /* ---------- world 3 ---------- */
  { name: "Spiral", rows: [
    "222222222222",
    "...........2",
    ".2222222222.",
    ".2........2.",
    ".2.22C222.2.",
    ".2.2....2.2.",
    ".2.222222.2.",
    ".2........2.",
    ".2222222222.",
  ]},
  { name: "Honeycomb", rows: [
    ".33.33.33.33",
    "3?33333?333.",
    ".33.33.33.33",
    "33333?33333.",
    ".33.33.33.33",
  ]},
  { name: "Lava Lake", rows: [
    "HHHHHHHHHHHH",
    "3.3.3.3.3.3.",
    ".H.H.H.H.H.H",
    "3.3.3.3.3.3.",
    "HHHHHHHHHHHH",
  ]},
  { name: "Ice Castle", rows: [
    "F.X.F..F.X.F",
    "FFXFFFFFFXFF",
    ".2X2C22C2X2.",
    "FFXFFFFFFXFF",
    "F.X.F..F.X.F",
  ]},
  { name: "The Grid", rows: [
    "333333333333",
    "3.2.2.2.2.3.",
    "323232323232",
    "3.2.2.2.2.3.",
    "333333333333",
  ]},
  { name: "Portal Maze", rows: [
    "P...X22X...P",
    "..2.X22X.2..",
    "2222X??X2222",
    "..2.X22X.2..",
    "P...X22X...P",
  ]},
  { name: "Bomb Factory", rows: [
    "B2E2B22B2E2B",
    "222222222222",
    ".B..E..B..E.",
    "222222222222",
    "E2B2E22E2B2E",
  ]},
  { name: "Neon Bastion", rows: [
    "..X33333X...",
    ".X3222223X..",
    "X32C111C23X.",
    ".X3222223X..",
    "..X33333X...",
    "111111111111",
  ]},
  { name: "The Gauntlet", rows: [
    "3B3?3CC3?3B3",
    "2H22F22F22H2",
    "X..E....E..X",
    "2F22H22H22F2",
    "3B3?3CC3?3B3",
    "111111111111",
  ]},
  { name: "Lava Core", boss: "core" },
];

// Difficulty defaults by level index (0-based). Levels override via params.
function levelParams(idx, level) {
  const base = {
    speed:    Math.min(230 + idx * 6, 340),
    ramp:     4 + idx * 0.25,
    maxSpeed: Math.min(430 + idx * 8, 620),
    drop:     idx < 10 ? 0.26 : 0.22,   // world 1 is more generous
  };
  return Object.assign(base, (level && level.params) || {});
}

if (typeof window === "undefined") {
  globalThis.LEVELS = LEVELS;
  globalThis.GRID_COLS = GRID_COLS;
  globalThis.levelParams = levelParams;
}

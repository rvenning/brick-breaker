"use strict";
// Data linter for Brick Breaker DX: every campaign level grid must be valid
// (right width, known brick chars, actually completable) and every registry
// consistent — a typo'd level char or an uncompletable layout fails here at
// commit time instead of in a kid's hands.
//
//   cd brick-breaker && node --test
//
// The js/ files are plain browser scripts with top-level `const`, so they're
// concatenated and run as ONE vm program, then exported to the sandbox.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const JS = path.join(__dirname, "..", "js");

function load() {
  const sandbox = { console };
  vm.createContext(sandbox);
  const src =
    fs.readFileSync(path.join(JS, "bricks.js"), "utf8") + "\n" +
    fs.readFileSync(path.join(JS, "powerups.js"), "utf8") + "\n" +
    fs.readFileSync(path.join(JS, "levels.js"), "utf8") + "\n" +
    fs.readFileSync(path.join(JS, "upgrades.js"), "utf8") + "\n" +
    ";globalThis.__bb = { BRICKS, POWERUPS, pickPowerup, LEVELS, GRID_COLS, levelParams, UPGRADES, upgradeValue };";
  vm.runInContext(src, sandbox, { filename: "bb-bundle.js" });
  return sandbox.__bb;
}

const { BRICKS, POWERUPS, pickPowerup, LEVELS, GRID_COLS, levelParams, UPGRADES, upgradeValue } = load();
const BOSSES = ["golem", "ufo", "core"];

test(`sanity: 30 levels, bosses at 10/20/30`, () => {
  assert.equal(LEVELS.length, 30);
  LEVELS.forEach((lv, i) => {
    if ((i + 1) % 10 === 0) assert.ok(lv.boss, `level ${i + 1} should be a boss`);
    else assert.ok(!lv.boss, `level ${i + 1} should not be a boss`);
  });
});

test("every boss level names a registered boss", () => {
  for (const lv of LEVELS.filter(l => l.boss))
    assert.ok(BOSSES.includes(lv.boss), `unknown boss "${lv.boss}"`);
});

test("every grid row is exactly GRID_COLS wide with known brick chars", () => {
  const fails = [];
  LEVELS.forEach((lv, i) => {
    if (lv.boss) return;
    lv.rows.forEach((row, r) => {
      if (row.length !== GRID_COLS)
        fails.push(`L${i + 1} "${lv.name}" row ${r}: width ${row.length}`);
      for (const ch of row)
        if (ch !== "." && !BRICKS[ch])
          fails.push(`L${i + 1} "${lv.name}" row ${r}: unknown char "${ch}"`);
    });
  });
  assert.deepEqual(fails, []);
});

test("every normal level is completable (has breakable bricks) and portals pair up", () => {
  const fails = [];
  LEVELS.forEach((lv, i) => {
    if (lv.boss) return;
    let breakable = 0, portals = 0;
    for (const row of lv.rows) for (const ch of row) {
      const t = BRICKS[ch];
      if (!t) continue;
      if (t.counts) breakable++;
      if (t.portal) portals++;
    }
    if (breakable === 0) fails.push(`L${i + 1} "${lv.name}": no breakable bricks`);
    if (portals === 1) fails.push(`L${i + 1} "${lv.name}": a single portal has nowhere to lead`);
  });
  assert.deepEqual(fails, []);
});

test("no breakable brick is sealed behind indestructible bricks", () => {
  // BFS from outside the layout: empty cells are passable, destructible bricks
  // become passable once broken, steel/portal never. Every brick that counts
  // toward completion must be reachable or the level can't be finished.
  // (Conservative: ignores corner-clips and portal teleports.)
  const fails = [];
  LEVELS.forEach((lv, i) => {
    if (lv.boss) return;
    const R = lv.rows.length, C = GRID_COLS;
    const passable = (r, c) => {
      if (r < 0 || r >= R || c < 0 || c >= C) return true;      // open space around the layout
      const ch = lv.rows[r][c];
      return ch === "." || (BRICKS[ch] && BRICKS[ch].hp !== Infinity);
    };
    const seen = new Set(), q = [];
    const push = (r, c) => {
      if (r < -1 || r > R || c < -1 || c > C) return;   // bound to a 1-cell border
      const k = r + "," + c;
      if (!seen.has(k) && passable(r, c)) { seen.add(k); q.push([r, c]); }
    };
    for (let c = -1; c <= C; c++) { push(-1, c); push(R, c); }
    for (let r = -1; r <= R; r++) { push(r, -1); push(r, C); }
    while (q.length) {
      const [r, c] = q.pop();
      push(r - 1, c); push(r + 1, c); push(r, c - 1); push(r, c + 1);
    }
    lv.rows.forEach((row, r) => {
      for (let c = 0; c < C; c++) {
        const t = BRICKS[row[c]];
        if (t && t.counts && !seen.has(r + "," + c))
          fails.push(`L${i + 1} "${lv.name}": sealed ${t.name} at row ${r} col ${c}`);
      }
    });
  });
  assert.deepEqual(fails, []);
});

test("difficulty params are sane and monotonic-ish", () => {
  LEVELS.forEach((lv, i) => {
    const p = levelParams(i, lv);
    assert.ok(p.speed >= 180 && p.speed <= 400, `L${i + 1} speed ${p.speed}`);
    assert.ok(p.maxSpeed > p.speed, `L${i + 1} maxSpeed <= speed`);
    assert.ok(p.drop > 0 && p.drop <= 0.6, `L${i + 1} drop ${p.drop}`);
  });
  assert.ok(levelParams(25, LEVELS[25]).speed > levelParams(0, LEVELS[0]).speed,
    "late levels should start faster than level 1");
});

test("brick registry invariants (steel never counts or drops, glyphs on specials)", () => {
  for (const [ch, t] of Object.entries(BRICKS)) {
    assert.ok(t.name, `brick "${ch}" missing name`);
    assert.ok(Array.isArray(t.colors) && t.colors.length >= 2, `brick "${ch}" needs [base, glow] colors`);
    if (t.hp === Infinity) {
      assert.equal(t.counts, false, `indestructible "${ch}" must not count toward completion`);
      assert.equal(t.drop, "never", `indestructible "${ch}" must never drop`);
    } else {
      assert.ok(Number.isFinite(t.hp) && t.hp >= 1, `brick "${ch}" hp`);
    }
  }
});

test("power-up registry: timed entries have durations, weights positive, picker always lands", () => {
  for (const [id, p] of Object.entries(POWERUPS)) {
    assert.ok(p.weight > 0, `${id} weight`);
    if (p.kind === "timed") assert.ok(p.dur > 0, `${id} needs dur`);
    else assert.equal(typeof p.apply, "function", `instant ${id} needs apply()`);
  }
  // deterministic sweep across [0,1) must always return an entry
  for (let i = 0; i < 1000; i++) {
    const p = pickPowerup(() => i / 1000, 2.4);
    assert.ok(p && POWERUPS[p.id], "picker returned nothing");
  }
});

test("upgrade table: costs/value lengths match and upgradeValue falls back", () => {
  for (const u of UPGRADES) {
    assert.equal(u.costs.length, u.value.length, `${u.id} costs/value mismatch`);
    assert.ok(u.costs.every((c, i) => i === 0 || c > u.costs[i - 1]), `${u.id} costs should rise`);
  }
  assert.equal(upgradeValue({}, "paddle", 1), 1);
  assert.equal(upgradeValue({ paddle: 2 }, "paddle", 1), 1.16);
  assert.equal(upgradeValue({ paddle: 99 }, "paddle", 1), 1.25, "over-levelled clamps to max");
});

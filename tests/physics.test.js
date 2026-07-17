"use strict";
// Physics helper tests — the pure math that keeps the ball fun: paddle bounce
// angles, the anti-loop guarantees, and collision normals.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load() {
  const sandbox = { console };
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "physics.js"), "utf8")
    + "\n;globalThis.__p = Physics;";
  vm.runInContext(src, sandbox, { filename: "physics.js" });
  return sandbox.__p;
}
const P = load();
const speedOf = (v) => Math.hypot(v.vx, v.vy);

test("paddle bounce: centre goes straight up, edges go steep, speed preserved", () => {
  const c = P.paddleBounce(100, 100, 80, 300);
  assert.ok(Math.abs(c.vx) < 1e-9 && c.vy < 0, "centre hit should go straight up");
  const r = P.paddleBounce(140, 100, 80, 300);
  const l = P.paddleBounce(60, 100, 80, 300);
  assert.ok(r.vx > 0 && l.vx < 0, "edge hits deflect outward");
  assert.ok(Math.abs(r.vx) > Math.abs(r.vy) * 0.8, "edge hit should be steep");
  for (const v of [c, r, l]) assert.ok(Math.abs(speedOf(v) - 300) < 1e-6, "speed preserved");
  // beyond the paddle edge clamps rather than exceeding the max angle
  const far = P.paddleBounce(500, 100, 80, 300);
  assert.ok(Math.abs(speedOf(far) - 300) < 1e-6 && far.vy < 0);
});

test("unstick: never flatter than 18% vertical, never steeper than 94%", () => {
  const flat = P.unstick(300, 1);
  assert.ok(Math.abs(flat.vy) >= speedOf(flat) * 0.17999, "flat trajectory must be nudged");
  const shaft = P.unstick(0, -300);
  assert.ok(Math.abs(shaft.vx) >= speedOf(shaft) * 0.05999, "vertical shaft must be nudged");
  const fine = P.unstick(200, -220);
  assert.deepEqual(fine, { vx: 200, vy: -220 }, "healthy angles untouched");
  // speed is preserved by the nudge
  assert.ok(Math.abs(speedOf(flat) - Math.hypot(300, 1)) < 1e-6);
});

test("circleRect: miss, side hit, corner hit, centre-inside all resolve", () => {
  assert.equal(P.circleRect(0, 0, 5, 10, 10, 20, 10), null, "clear miss");
  const side = P.circleRect(8, 15, 5, 10, 10, 20, 10);   // left face
  assert.ok(side && side.nx === -1 && side.ny === 0);
  const corner = P.circleRect(7, 7, 5, 10, 10, 20, 10);  // top-left corner
  assert.ok(corner && corner.nx < 0 && corner.ny < 0);
  const inside = P.circleRect(11, 15, 5, 10, 10, 20, 10);
  assert.ok(inside && inside.depth > 0, "centre inside still resolves outward");
});

test("reflect: bounces only when moving into the surface", () => {
  const hit = P.reflect(0, 300, 0, -1);      // moving down into a floor facing up
  assert.deepEqual(hit, { vx: 0, vy: -300, bounced: true });
  const away = P.reflect(0, -300, 0, -1);    // already moving away
  assert.equal(away.bounced, false);
});

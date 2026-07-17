"use strict";
// Merge-safety tests for the progress reconciler. The critical property: coins
// are a spendable currency, so the merge must never resurrect spent coins —
// that's why the ledger is two monotonic counters (coinsEarned/coinsSpent)
// merged with max() instead of a single balance.
//
// storage.js is loaded with a stub GK.createStorage that just hands back the
// config, so mergeProgress/blankProgress are tested exactly as shipped.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const JS = path.join(__dirname, "..", "js");

function load() {
  const sandbox = {
    console,
    window: { FIREBASE_CONFIG: null },
    GK: { createStorage: (cfg) => ({ ...cfg }) },
  };
  vm.createContext(sandbox);
  const src =
    fs.readFileSync(path.join(JS, "levels.js"), "utf8") + "\n" +
    fs.readFileSync(path.join(JS, "upgrades.js"), "utf8") + "\n" +
    fs.readFileSync(path.join(JS, "storage.js"), "utf8") + "\n" +
    ";globalThis.__s = Storage;";
  vm.runInContext(src, sandbox, { filename: "bb-storage-bundle.js" });
  return sandbox.__s;
}

const S = load();
const blank = () => S.blankProgress();

test("blank progress has the full shape including updated", () => {
  const b = blank();
  for (const k of ["coinsEarned", "coinsSpent", "best", "levels", "upgrades", "updated"])
    assert.ok(k in b, `missing ${k}`);
});

test("merge never resurrects spent coins", () => {
  // device A: earned 500, spent 300 in the shop (balance 200)
  const a = { ...blank(), coinsEarned: 500, coinsSpent: 300 };
  // device B: stale copy from before the purchase (balance looks like 500)
  const b = { ...blank(), coinsEarned: 500, coinsSpent: 0 };
  for (const m of [S.mergeProgress(a, b), S.mergeProgress(b, a)]) {
    assert.equal(m.coinsEarned, 500);
    assert.equal(m.coinsSpent, 300, "spend must survive the merge in both directions");
    assert.equal(S.coins(m), 200);
  }
});

test("merge keeps the best of each level and each upgrade", () => {
  const a = { ...blank(), levels: { 0: { score: 900, stars: 2 }, 1: { score: 100, stars: 3 } },
              upgrades: { paddle: 2 } };
  const b = { ...blank(), levels: { 0: { score: 700, stars: 3 } }, upgrades: { paddle: 1, drops: 1 } };
  const m = S.mergeProgress(a, b);
  assert.deepEqual(m.levels[0], { score: 900, stars: 3 }, "score and stars merge independently");
  assert.deepEqual(m.levels[1], { score: 100, stars: 3 }, "level only on one device survives");
  assert.equal(m.upgrades.paddle, 2);
  assert.equal(m.upgrades.drops, 1);
});

test("fields added by a newer client survive an older client's merge", () => {
  const a = { ...blank(), futureField: "keep-me" };
  const m = S.mergeProgress(a, blank());
  assert.equal(m.futureField, "keep-me");
});

test("coins() never goes negative even on corrupt data", () => {
  assert.equal(S.coins({ coinsEarned: 10, coinsSpent: 999 }), 0);
  assert.equal(S.coins({}), 0);
});

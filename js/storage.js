// Persistence: gamekit storage configured for Brick Breaker DX.
// bb_* localStorage keys, "brickbreaker" Firestore collection.
//
// Coins are SPENT in the shop, so a plain max() merge would resurrect spent
// coins on the next device sync. Instead both sides of the ledger are
// monotonic counters — coinsEarned and coinsSpent only ever grow — and the
// balance is derived. max() is then always safe.

const Storage = GK.createStorage({
  prefix: "bb",
  collection: "brickbreaker",
  firebaseConfig: window.FIREBASE_CONFIG,
  blankProgress: () => ({
    coinsEarned: 0, coinsSpent: 0,
    best: 0,                       // best single-level score (leaderboard headline)
    totalScore: 0,                 // sum of best score per level (computed)
    levels: {},                    // { [idx]: { score, stars } } best result per level
    upgrades: {},                  // { [upgradeId]: level }
    updated: 0,
  }),
  mergeProgress: (a, b) => {
    const levels = { ...(a.levels || {}) };
    for (const [idx, lv] of Object.entries(b.levels || {})) {
      const cur = levels[idx];
      if (!cur) { levels[idx] = lv; continue; }
      levels[idx] = {
        score: Math.max(cur.score || 0, lv.score || 0),
        stars: Math.max(cur.stars || 0, lv.stars || 0),
      };
    }
    const upgrades = { ...(a.upgrades || {}) };
    for (const [id, lvl] of Object.entries(b.upgrades || {}))
      upgrades[id] = Math.max(upgrades[id] || 0, lvl);
    return {
      ...a, ...b,
      coinsEarned: Math.max(a.coinsEarned || 0, b.coinsEarned || 0),
      coinsSpent:  Math.max(a.coinsSpent  || 0, b.coinsSpent  || 0),
      best: Math.max(a.best || 0, b.best || 0),
      totalScore: Math.max(a.totalScore || 0, b.totalScore || 0),
      levels, upgrades,
    };
  },
});

/* ----- Brick Breaker-specific helpers ----- */
Object.assign(Storage, {
  coins(progress) { return Math.max(0, (progress.coinsEarned || 0) - (progress.coinsSpent || 0)); },

  totalStars(progress) {
    return Object.values(progress.levels || {}).reduce((s, l) => s + (l.stars || 0), 0);
  },

  // Levels unlock in order: next level after the highest completed one.
  unlockedLevel(progress) {
    let max = -1;
    for (const k of Object.keys(progress.levels || {})) max = Math.max(max, Number(k));
    return Math.min(max + 1, LEVELS.length - 1);
  },

  // Record a level result; returns the updated progress. Only a WIN records
  // the level (recording a loss would unlock the next level); consolation
  // coins are banked either way.
  recordResult(profileId, levelIdx, { win, score, stars, coins }) {
    const prog = this.getProgress(profileId);
    if (win) {
      const cur = prog.levels[levelIdx];
      if (!cur || score > (cur.score || 0)) {
        prog.levels[levelIdx] = { score, stars: Math.max(stars, (cur && cur.stars) || 0) };
      } else if (stars > (cur.stars || 0)) cur.stars = stars;
      prog.best = Math.max(prog.best || 0, score);
      prog.totalScore = Object.values(prog.levels).reduce((s, l) => s + (l.score || 0), 0);
    }
    prog.coinsEarned = (prog.coinsEarned || 0) + coins;
    this.saveProgress(profileId, prog);
    return prog;
  },

  buyUpgrade(profileId, upgradeId) {
    const prog = this.getProgress(profileId);
    const def = UPGRADES.find(u => u.id === upgradeId);
    const lvl = (prog.upgrades && prog.upgrades[upgradeId]) || 0;
    if (!def || lvl >= def.costs.length) return { ok: false, reason: "maxed" };
    const cost = def.costs[lvl];
    if (this.coins(prog) < cost) return { ok: false, reason: "coins" };
    prog.coinsSpent = (prog.coinsSpent || 0) + cost;
    prog.upgrades = prog.upgrades || {};
    prog.upgrades[upgradeId] = lvl + 1;
    this.saveProgress(profileId, prog);
    return { ok: true, progress: prog };
  },
});

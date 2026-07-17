// App shell: screens, campaign level map, upgrade shop, leaderboard, results.
// Profiles/PINs/install come from gamekit. Game modes are a data table so
// future modes (endless, boss rush…) slot in without touching the flow.

const AVATARS = ["🚀", "👾", "🤖", "🦄", "🐱", "🦊", "🐼", "🐸", "🦖", "🐙", "🦉", "⭐"];

const MODES = [
  { id: "campaign", name: "Classic Campaign", desc: "30 levels · 3 bosses", available: true },
  { id: "endless",  name: "Endless",          desc: "Coming soon",          available: false },
  { id: "bossrush", name: "Boss Rush",        desc: "Coming soon",          available: false },
];

const App = {
  profile: null,

  el(id) { return document.getElementById(id); },

  async init() {
    Sfx.enabled = Storage.getSettings().sound;
    GK.UI.onScreenChange = (name) => {
      Game.active = name === "game";
      if (name !== "game") Sfx.stopBossMusic();
      if (name === "splash") this.refreshSplash();
    };
    GK.UI.bindSoundToggle(Storage);

    GK.Profiles.init({
      storage: Storage,
      avatars: AVATARS,
      meta: (p, prog) => `🏆 ${(prog.best || 0).toLocaleString()} · ⭐ ${Storage.totalStars(prog)} · 🪙 ${Storage.coins(prog)}`,
      onEnter: (p) => { this.profile = p; this.showMap(); },
      addLabel: "New Player",
    });

    GK.initPWA({ appName: "Brick Breaker DX" });
    Game.boot();

    this.showScreen("splash");
    Storage.initFirebase().then(ok => {
      this.el("sync-badge").textContent = ok ? "☁️ family sync on" : "📴 offline";
      if (ok && GK.UI.screen === "profiles") GK.Profiles.renderList();
      if (ok && GK.UI.screen === "splash") this.refreshSplash();
      if (ok && GK.UI.screen === "map") this.showMap();
      if (ok && GK.UI.screen === "leaderboard") this.showLeaderboard(true);
    });
  },

  showScreen(name) { GK.UI.showScreen(name); },

  refreshSplash() {
    const last = GK.Profiles.lastProfile();
    const cont = this.el("btn-continue-as"), start = this.el("btn-start");
    if (last) {
      cont.style.display = "";
      cont.textContent = `🚀 Continue as ${last.avatar} ${last.name}`;
      cont.onclick = () => { Sfx.init(); GK.Profiles.select(last); };
      start.classList.add("ghost");
      start.textContent = "👥 Switch Player";
    } else {
      cont.style.display = "none";
      start.classList.remove("ghost");
      start.textContent = "🕹️ Play";
    }
  },

  play() {
    Sfx.init(); Sfx.click();
    GK.Profiles.renderList();
    this.showScreen("profiles");
  },

  /* ---------- level map ---------- */
  showMap() {
    if (!this.profile) return this.play();
    Sfx.stopBossMusic();
    const prog = Storage.getProgress(this.profile.id);
    const unlocked = Storage.unlockedLevel(prog);

    this.el("map-player").innerHTML = `${this.profile.avatar} <b>${GK.util.esc(this.profile.name)}</b>`;
    this.el("map-coins").innerHTML = `🪙 ${Storage.coins(prog)}`;
    this.el("map-stars").innerHTML = `⭐ ${Storage.totalStars(prog)}/${LEVELS.length * 3}`;

    const cont = this.el("btn-continue");
    if (!prog.levels[LEVELS.length - 1]) {
      const lv = LEVELS[unlocked];
      cont.innerHTML = `▶️ ${lv.boss ? "☠️ BOSS: " : ""}Level ${unlocked + 1} — ${GK.util.esc(lv.name)}`;
      cont.onclick = () => { Sfx.click(); this.startLevel(unlocked); };
    } else {
      cont.innerHTML = `🏆 Campaign complete! Replay any level`;
      cont.onclick = () => Sfx.click();
    }

    const wrap = this.el("level-grid");
    wrap.innerHTML = "";
    LEVELS.forEach((lv, i) => {
      const result = prog.levels[i];
      const state = result ? "done" : i <= unlocked ? "open" : "locked";
      const cell = document.createElement("button");
      cell.className = `lvl ${state}${lv.boss ? " boss" : ""}`;
      const stars = result ? "★".repeat(result.stars) + "☆".repeat(3 - result.stars) : "";
      cell.innerHTML = state === "locked"
        ? `<span class="lvl-n">🔒</span>`
        : `<span class="lvl-n">${lv.boss ? "☠️" : i + 1}</span><span class="lvl-stars">${stars}</span>`;
      cell.title = lv.name;
      if (state !== "locked") cell.onclick = () => { Sfx.click(); this.startLevel(i); };
      wrap.appendChild(cell);
    });

    this.showScreen("map");
  },

  startLevel(idx) {
    Game.start(this.profile, idx);
    if (LEVELS[idx].boss) Sfx.startBossMusic();
  },

  /* ---------- results ---------- */
  levelDone(res) {
    Sfx.stopBossMusic();
    const prog = Storage.recordResult(this.profile.id, res.levelIdx, res);
    this.el("res-emoji").textContent = res.win ? (res.boss ? "👑" : "🎉") : "💫";
    this.el("res-title").textContent = res.win
      ? (res.boss ? "BOSS DEFEATED!" : `Level ${res.levelIdx + 1} clear!`)
      : "So close!";
    this.el("res-stars").innerHTML = [0, 1, 2].map(s =>
      `<span class="star ${s < res.stars ? "on" : ""}">★</span>`).join("");
    this.el("res-score").textContent = res.score.toLocaleString();
    this.el("res-combo").textContent = res.comboBest > 2 ? `🔥 Best combo ×${res.comboBest}` : "";
    this.el("res-coins").textContent = res.coins ? `+${res.coins} 🪙  (balance ${Storage.coins(prog)})` : "";

    const retry = this.el("res-retry"), next = this.el("res-next");
    retry.style.display = "";
    retry.textContent = res.win ? "↻ Replay" : "↻ Try Again";
    retry.className = res.win ? "btn ghost" : "btn";
    retry.onclick = () => { Sfx.click(); this.startLevel(res.levelIdx); };
    const hasNext = res.win && res.levelIdx + 1 < LEVELS.length;
    next.style.display = hasNext ? "" : "none";
    if (hasNext) {
      const nl = LEVELS[res.levelIdx + 1];
      next.textContent = nl.boss ? `☠️ Boss: ${nl.name}` : `▶️ Level ${res.levelIdx + 2}`;
      next.onclick = () => { Sfx.click(); this.startLevel(res.levelIdx + 1); };
    }
    this.el("res-finished").style.display =
      (res.win && res.levelIdx === LEVELS.length - 1) ? "" : "none";
    if (res.win) { setTimeout(() => Sfx.coin(), 400); }
    this.showScreen("results");
  },

  /* ---------- upgrade shop ---------- */
  showShop() {
    Sfx.click();
    const prog = Storage.getProgress(this.profile.id);
    this.el("shop-coins").textContent = `🪙 ${Storage.coins(prog)}`;
    const wrap = this.el("shop-list");
    wrap.innerHTML = "";
    for (const u of UPGRADES) {
      const lvl = (prog.upgrades && prog.upgrades[u.id]) || 0;
      const maxed = lvl >= u.costs.length;
      const cost = maxed ? null : u.costs[lvl];
      const afford = !maxed && Storage.coins(prog) >= cost;
      const card = document.createElement("div");
      card.className = "shop-card" + (maxed ? " maxed" : "");
      card.innerHTML = `
        <div class="shop-icon">${u.icon}</div>
        <div class="shop-info">
          <div class="shop-name">${u.name}
            <span class="shop-pips">${"●".repeat(lvl)}${"○".repeat(u.costs.length - lvl)}</span></div>
          <div class="shop-desc">${u.desc}${lvl ? ` — now ${u.fmt(u.value[lvl - 1])}` : ""}</div>
        </div>
        <button class="btn small ${maxed ? "grey" : afford ? "" : "grey"}" ${maxed || !afford ? "disabled" : ""}>
          ${maxed ? "MAX" : `🪙 ${cost}`}</button>`;
      if (!maxed && afford) {
        card.querySelector("button").onclick = () => {
          const r = Storage.buyUpgrade(this.profile.id, u.id);
          if (r.ok) { Sfx.powerup(); this.showShop(); }
        };
      }
      wrap.appendChild(card);
    }
    this.showScreen("shop");
  },

  /* ---------- leaderboard ---------- */
  showLeaderboard(silent) {
    if (!silent) Sfx.click();
    GK.Profiles.renderLeaderboard("lb-rows", {
      cols: r => `<span class="lb-stat">⭐ ${Storage.totalStars(r.progress)}</span>
        <span class="lb-stat">🏆 ${(r.progress.best || 0).toLocaleString()}</span>`,
      sort: (a, b) => (b.progress.totalScore || b.progress.best || 0) - (a.progress.totalScore || a.progress.best || 0),
      meId: this.profile?.id,
      empty: "No players yet — tap Play!",
    });
    this.showScreen("leaderboard");
  },
};

window.addEventListener("DOMContentLoaded", () => App.init());

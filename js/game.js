// The game engine. Physics run in a fixed logical playfield (LW×LH) that is
// scaled to fit the canvas — resolution- and retina-independent (see
// lessons.md: canvas gets an explicit CSS size; attributes only size the
// backing store).
//
// Reusable systems, not game-specific branches:
//   - bricks come from the BRICKS registry (js/bricks.js)
//   - power-ups from POWERUPS (js/powerups.js); timed ones live in
//     this.effects and the engine *derives* paddle/ball state from them
//   - bosses implement { update, render, ballTargets, hpFrac, dead }
//     (js/bosses.js) — the engine knows nothing about individual bosses
//   - juice goes through Fx (js/fx.js)

const LW = 420, LH = 660;          // logical playfield size
const BW = LW / GRID_COLS;         // brick cell width (35)
const BH = 20;                     // brick cell height
const BRICK_TOP = 48;              // first brick row y
const PADDLE_Y = LH - 34;

const Game = {
  canvas: null, ctx: null, DPR: 1, scale: 1, offX: 0, offY: 0, viewW: 0, viewH: 0,
  active: false, running: false, paused: false, over: false,
  stars: [], spriteCache: new Map(),

  /* ================= boot / canvas ================= */
  boot() {
    this.canvas = document.getElementById("cv");
    this.ctx = this.canvas.getContext("2d");
    this.resize();
    const re = () => this.resize();
    window.addEventListener("resize", re);
    window.addEventListener("orientationchange", () => setTimeout(re, 350));
    if (window.visualViewport) window.visualViewport.addEventListener("resize", re);
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.pause(); });
    this.bindInput();
    this._last = performance.now();
    requestAnimationFrame(t => this.loop(t));
  },

  resize() {
    const wrap = this.canvas.parentElement;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) { setTimeout(() => this.resize(), 200); return; }
    this.DPR = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.style.width = w + "px"; this.canvas.style.height = h + "px";
    this.canvas.width = Math.round(w * this.DPR);
    this.canvas.height = Math.round(h * this.DPR);
    this.viewW = w; this.viewH = h;
    this.scale = Math.min(w / LW, h / LH);
    this.offX = (w - LW * this.scale) / 2;
    this.offY = (h - LH * this.scale) / 2;
    this.spriteCache.clear();
    this.stars = [];
    for (let i = 0; i < 70; i++) this.stars.push({
      x: Math.random() * w, y: Math.random() * h,
      r: 0.6 + Math.random() * 1.8, sp: 4 + Math.random() * 18, tw: Math.random() * 6.28,
    });
  },

  toLogical(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left - this.offX) / this.scale,
             y: (clientY - r.top - this.offY) / this.scale };
  },

  /* ================= input ================= */
  bindInput() {
    const cv = this.canvas;
    const move = (cx) => { if (this.running) this.paddle.target = this.toLogical(cx, 0).x; };
    cv.addEventListener("pointerdown", e => {
      e.preventDefault(); GK.Sfx.init();
      move(e.clientX);
      this.tapAction();
    });
    cv.addEventListener("pointermove", e => { e.preventDefault(); if (e.buttons || e.pointerType === "touch") move(e.clientX); });
    // touch: follow the finger even without buttons state
    cv.addEventListener("touchmove", e => { e.preventDefault(); move(e.touches[0].clientX); }, { passive: false });
    window.addEventListener("keydown", e => {
      if (!this.active) return;
      if (e.code === "Escape" || e.code === "KeyP") { e.preventDefault(); this.togglePause(); return; }
      if (this.paused) return;
      if (e.code === "Space") { e.preventDefault(); this.tapAction(); }
      if (e.code === "ArrowLeft" || e.code === "KeyA") this.keyDir = -1;
      if (e.code === "ArrowRight" || e.code === "KeyD") this.keyDir = 1;
    });
    window.addEventListener("keyup", e => {
      if ((e.code === "ArrowLeft" || e.code === "KeyA") && this.keyDir === -1) this.keyDir = 0;
      if ((e.code === "ArrowRight" || e.code === "KeyD") && this.keyDir === 1) this.keyDir = 0;
    });
    document.addEventListener("gesturestart", e => e.preventDefault());
    document.addEventListener("gesturechange", e => e.preventDefault());
  },

  tapAction() {
    if (!this.running || this.paused) return;
    let launched = false;
    for (const b of this.balls) if (b.stuck) { this.launchBall(b); launched = true; }
    if (launched) Sfx.launch();
  },

  /* ================= level lifecycle ================= */
  start(profile, levelIdx) {
    this.profile = profile;
    this.progress = Storage.getProgress(profile.id);
    this.upgrades = this.progress.upgrades || {};
    this.levelIdx = levelIdx;
    this.level = LEVELS[levelIdx];
    this.params = levelParams(levelIdx, this.level);

    this.score = 0; this.elapsed = 0;
    this.lives = 3 + upgradeValue(this.upgrades, "life", 0);
    this.livesLost = 0;
    this.combo = 0; this.comboBest = 0;
    this.effects = {};
    this.balls = []; this.drops = []; this.lasers = []; this.hazards = [];
    this.laserCd = 0; this.keyDir = 0;
    this.paddle = { x: LW / 2, target: LW / 2, w: 76, y: PADDLE_Y, squash: 1, stun: 0 };
    this.boss = null;
    Fx.reset(); Tween.clear();

    this.buildLevel();
    this.spawnBall(true);
    const laserStart = upgradeValue(this.upgrades, "laserstart", 0);
    if (laserStart) this.effects.laser = laserStart;

    this.running = true; this.paused = false; this.over = false;
    this.updateHud();
    GK.UI.showScreen("game");
    this.worldHue = [200, 265, 330][Math.floor(levelIdx / 10)] || 200;
  },

  buildLevel() {
    this.bricks = []; this.grid = new Map(); this.portals = [];
    this.breakableLeft = 0;
    if (this.level.boss) {
      this.boss = Bosses.create(this.level.boss, this);
      return;
    }
    (this.level.rows || []).forEach((row, r) => {
      for (let c = 0; c < GRID_COLS; c++) {
        const ch = row[c];
        if (!ch || ch === ".") continue;
        const type = BRICKS[ch];
        if (!type) continue;
        const brick = {
          ch, type, col: c, row: r, hp: type.hp, maxHp: type.hp,
          x: c * BW, y: BRICK_TOP + r * BH, w: BW, h: BH,
          cx: c * BW + BW / 2, cy: BRICK_TOP + r * BH + BH / 2,
          alive: true, fuse: 0, flash: 0,
        };
        this.bricks.push(brick);
        this.grid.set(r * GRID_COLS + c, brick);
        if (type.portal) this.portals.push(brick);
        if (type.counts) this.breakableLeft++;
      }
    });
  },

  spawnBall(stuck) {
    const b = { x: this.paddle.x, y: this.paddle.y - 12, vx: 0, vy: 0, r: 6.5,
                stuck: !!stuck, stuckDx: 0, stuckT: 0, portalCd: 0, zapCd: 0, lastBrick: null };
    this.balls.push(b);
    return b;
  },

  launchBall(b) {
    b.stuck = false;
    const a = (Math.random() * 0.5 - 0.25);
    const s = this.currentSpeed();
    b.vx = Math.sin(a) * s; b.vy = -Math.cos(a) * s;
  },

  currentSpeed() {
    let s = Math.min(this.params.speed + this.params.ramp * this.elapsed, this.params.maxSpeed);
    if (this.effects.fast)  s *= 1.3;
    if (this.effects.slow)  s *= 0.75;
    if (this.effects.chill) s *= 0.65;
    if (this.effects.blaze) s *= 1.3;
    return s;
  },

  paddleWidth() {
    let w = 76 * upgradeValue(this.upgrades, "paddle", 1);
    if (this.effects.giant) w *= 1.85;
    else if (this.effects.wide) w *= 1.4;
    if (this.paddle.stun > 0) w *= 0.65;
    return w;
  },

  applyTimedEffect(id, dur) {
    const p = POWERUPS[id];
    const cap = ((p && p.dur) || dur) * 2;                 // stacking cap: 2× base
    this.effects[id] = Math.min((this.effects[id] || 0) + dur, cap);
    this.updateHud();
  },

  /* ================= main loop ================= */
  loop(now) {
    let dt = (now - this._last) / 1000; this._last = now;
    if (dt > 0.05) dt = 0.05;
    if (this.active) {
      if (this.running && !this.paused) this.update(dt * Fx.timeScale, dt);
      Fx.update(dt); Tween.update(dt);
      this.render();
    }
    requestAnimationFrame(t => this.loop(t));
  },

  update(dt, realDt) {
    this.elapsed += dt;

    // timed effects tick down
    for (const id of Object.keys(this.effects)) {
      this.effects[id] -= realDt;
      if (this.effects[id] <= 0) { delete this.effects[id]; this.updateHud(); }
    }
    if (this.paddle.stun > 0) this.paddle.stun -= realDt;

    // paddle
    const p = this.paddle;
    if (this.keyDir) p.target = p.x + this.keyDir * 460 * dt;
    p.target = Physics.clamp(p.target, 30, LW - 30);
    p.x += (p.target - p.x) * Math.min(1, dt * 16);
    p.w = this.paddleWidth();

    // bomb fuses
    for (const br of this.bricks) {
      if (br.alive && br.fuse > 0) {
        br.fuse -= dt;
        if (br.fuse <= 0) this.destroyBrick(br, "fuse");
      }
      if (br.flash > 0) br.flash -= dt * 6;
    }

    // balls
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      if (b.stuck) {
        b.stuckT += dt;
        b.x = p.x + b.stuckDx; b.y = p.y - 12;
        if (b.stuckT > 3) { this.launchBall(b); Sfx.launch(); }
        continue;
      }
      if (b.portalCd > 0) b.portalCd -= dt;
      if (b.zapCd > 0) b.zapCd -= dt;
      this.moveBall(b, dt);
      Fx.trail(b.x, b.y, this.ballColor(), b.r * 0.7);
      if (b.y > LH + b.r) {
        if (this.effects.shield) {
          delete this.effects.shield;
          b.y = LH - 4; b.vy = -Math.abs(b.vy);
          Fx.burst(b.x, LH, "#2dd4bf", 20, 200); Fx.addFlash(0.15, "#2dd4bf");
          Sfx.shieldSave(); this.updateHud();
        } else {
          this.balls.splice(i, 1);
          Fx.burst(b.x, LH - 6, "#f87171", 14, 160);
          if (this.balls.length === 0) this.loseLife();
        }
      }
    }

    // lasers
    if (this.effects.laser) {
      this.laserCd -= dt;
      if (this.laserCd <= 0) {
        this.laserCd = 0.32;
        const w = p.w / 2 - 6;
        this.lasers.push({ x: p.x - w, y: p.y - 10 }, { x: p.x + w, y: p.y - 10 });
        Sfx.laser();
      }
    }
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      l.y -= 560 * dt;
      const hit = this.brickAtPoint(l.x, l.y);
      if (hit) {
        this.hitBrick(hit, 1, null);
        Fx.burst(l.x, hit.y + hit.h, "#f43f5e", 6, 120, 0.3, 2);
        this.lasers.splice(i, 1);
      } else if (this.boss && this.boss.laserHit && this.boss.laserHit(l)) {
        this.lasers.splice(i, 1);
      } else if (l.y < -10) this.lasers.splice(i, 1);
    }

    // falling power-ups
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.vy = Math.min(d.vy + 140 * dt, 190);
      if (this.effects.magnet) {
        const dx = p.x - d.x, dy = (p.y - 8) - d.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 190) { d.x += dx / dist * 240 * dt; d.y += dy / dist * 120 * dt; }
      }
      d.y += d.vy * dt; d.spin += dt * 4;
      if (d.y > p.y - 10 && d.y < p.y + 16 && Math.abs(d.x - p.x) < p.w / 2 + 10) {
        this.catchPowerup(d.type);
        this.drops.splice(i, 1);
      } else if (d.y > LH + 20) this.drops.splice(i, 1);
    }

    // boss + hazards
    if (this.boss && !this.boss.dead) this.boss.update(dt);
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hz = this.hazards[i];
      hz.x += (hz.vx || 0) * dt; hz.y += hz.vy * dt;
      hz.t = (hz.t || 0) + dt;
      if (hz.y > p.y - 12 && hz.y < p.y + 18 && Math.abs(hz.x - p.x) < p.w / 2 + hz.r) {
        this.hazards.splice(i, 1);
        this.paddle.stun = 3;
        Fx.burst(hz.x, hz.y, "#f87171", 24, 240); Fx.addShake(8); Fx.addFlash(0.2, "#f87171");
        Sfx.paddleHit();
        Fx.text(p.x, p.y - 30, "OUCH!", { color: "#f87171", size: 18 });
      } else if (hz.y > LH + 30 || hz.x < -30 || hz.x > LW + 30) this.hazards.splice(i, 1);
    }

    this.updateHudCombo();
  },

  /* ================= ball physics ================= */
  moveBall(b, dt) {
    // keep speed pinned to the ramped target
    const target = this.currentSpeed();
    const v = Physics.atSpeed(b.vx, b.vy, target);
    b.vx = v.vx; b.vy = v.vy;

    const dist = target * dt;
    const steps = Math.max(1, Math.ceil(dist / 6));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      b.x += b.vx * sdt; b.y += b.vy * sdt;
      this.collideWalls(b);
      this.collidePaddle(b);
      if (this.collideBricks(b)) { /* may have destroyed bricks */ }
      if (this.boss) this.collideBoss(b);
      if (!this.running) return;                 // level ended mid-step
    }
  },

  collideWalls(b) {
    if (b.x < b.r)      { b.x = b.r; b.vx = Math.abs(b.vx); this.wallBounce(b); }
    if (b.x > LW - b.r) { b.x = LW - b.r; b.vx = -Math.abs(b.vx); this.wallBounce(b); }
    if (b.y < b.r)      { b.y = b.r; b.vy = Math.abs(b.vy); this.wallBounce(b); }
  },
  wallBounce(b) {
    const u = Physics.unstick(b.vx, b.vy);
    b.vx = u.vx; b.vy = u.vy;
    Sfx.wall();
    Fx.burst(b.x, b.y, "#475569", 4, 60, 0.25, 1.6);
  },

  collidePaddle(b) {
    const p = this.paddle;
    if (b.vy <= 0) return;
    const hit = Physics.circleRect(b.x, b.y, b.r, p.x - p.w / 2, p.y - 7, p.w, 14);
    if (!hit) return;
    if (this.effects.sticky && !b.stuck) {
      b.stuck = true; b.stuckT = 0; b.stuckDx = Physics.clamp(b.x - p.x, -p.w / 2, p.w / 2);
      b.vx = 0; b.vy = 0;
      Sfx.stick();
    } else {
      const v = Physics.paddleBounce(b.x, p.x, p.w, this.currentSpeed());
      b.vx = v.vx; b.vy = v.vy;
      b.y = p.y - 7 - b.r;
      Sfx.paddle();
    }
    this.resetCombo();
    p.squash = 1; Tween.to(p, { squash: 0 }, 0.24);   // squash kick, eased back
    Fx.burst(b.x, p.y - 8, "#22d3ee", 6, 90, 0.3, 2);
  },

  brickAtPoint(x, y) {
    const c = Math.floor(x / BW), r = Math.floor((y - BRICK_TOP) / BH);
    if (c < 0 || c >= GRID_COLS || r < 0) return null;
    const br = this.grid.get(r * GRID_COLS + c);
    return br && br.alive ? br : null;
  },

  collideBricks(b) {
    // check the 3×3 cell neighbourhood around the ball
    const c0 = Math.floor((b.x - b.r) / BW), c1 = Math.floor((b.x + b.r) / BW);
    const r0 = Math.floor((b.y - b.r - BRICK_TOP) / BH), r1 = Math.floor((b.y + b.r - BRICK_TOP) / BH);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (c < 0 || c >= GRID_COLS || r < 0) continue;
        const br = this.grid.get(r * GRID_COLS + c);
        if (!br || !br.alive) continue;
        const hit = Physics.circleRect(b.x, b.y, b.r, br.x, br.y, br.w, br.h);
        if (!hit) continue;

        // portal bricks teleport instead of bouncing
        if (br.type.portal) {
          if (b.portalCd <= 0 && this.portals.length > 1) this.teleportBall(b, br);
          return true;
        }

        const ghost = this.ballPasses(br);   // fireball/pierce/heavy pass through kills
        if (!ghost) {
          const rf = Physics.reflect(b.vx, b.vy, hit.nx, hit.ny);
          b.vx = rf.vx; b.vy = rf.vy;
          b.x += hit.nx * hit.depth; b.y += hit.ny * hit.depth;
          const u = Physics.unstick(b.vx, b.vy);
          b.vx = u.vx; b.vy = u.vy;
        }
        this.hitBrick(br, this.ballDamage(), b);
        return true;
      }
    }
    return false;
  },

  ballDamage() {
    if (this.effects.fireball) return 99;
    if (this.effects.heavy) return 2;
    return 1;
  },
  // Does the ball pass through the brick instead of bouncing?
  ballPasses(br) {
    if (br.type.hp === Infinity) return false;           // nothing ghosts steel
    if (this.effects.fireball || this.effects.pierce) return true;
    if (this.effects.heavy && br.hp <= 2) return true;   // heavy smashes through
    return false;
  },
  ballColor() {
    if (this.effects.fireball) return "#fb923c";
    if (this.effects.electric) return "#fde047";
    if (this.effects.heavy) return "#a8a29e";
    if (this.effects.chill) return "#93c5fd";
    return "#f8fafc";
  },

  teleportBall(b, fromBrick) {
    const i = this.portals.indexOf(fromBrick);
    const out = this.portals[(i + 1) % this.portals.length];
    Fx.burst(b.x, b.y, "#2dd4bf", 14, 150);
    // exit below/above the destination portal, continuing in the same direction
    b.x = out.cx; b.y = out.cy + (b.vy >= 0 ? out.h : -out.h);
    b.portalCd = 0.6;
    Fx.burst(b.x, b.y, "#2dd4bf", 14, 150);
    Sfx.portal();
  },

  /* ================= brick damage ================= */
  hitBrick(brick, dmg, ball) {
    if (!brick.alive) return;
    const t = brick.type;
    if (t.hp === Infinity) {
      Sfx.steel(); Fx.burst(brick.cx, brick.cy, "#94a3b8", 5, 80, 0.25, 1.6);
      brick.flash = 1;
      return;
    }
    // electric ball: arc to nearby bricks (with a per-ball cooldown)
    if (ball && this.effects.electric && ball.zapCd <= 0) {
      ball.zapCd = 0.5;
      this.zapNearby(brick, 2);
    }
    if (ball && this.effects.explosive) this.explodeAt(brick.cx, brick.cy, 1.1, brick, true);

    brick.hp -= dmg;
    brick.flash = 1;
    if (brick.hp <= 0) this.destroyBrick(brick, ball ? "ball" : "other");
    else {
      if (t.onHit) t.onHit(this, brick);
      Sfx.brickHit(this.combo);
      Fx.burst(brick.cx, brick.cy, t.colors[0], 6, 100, 0.3, 2);
    }
  },

  destroyBrick(brick, cause) {
    if (!brick.alive) return;
    brick.alive = false;
    this.grid.delete(brick.row * GRID_COLS + brick.col);
    const t = brick.type;
    if (t.counts) this.breakableLeft--;

    // combo + score
    this.combo++;
    this.comboBest = Math.max(this.comboBest, this.combo);
    const mult = this.comboMult();
    const pts = Math.round(t.score * mult * upgradeValue(this.upgrades, "score", 1));
    this.score += pts;

    // juice scales with combo tier
    const tier = mult >= 20 ? 3 : mult >= 10 ? 2 : mult >= 5 ? 1 : 0;
    Fx.burst(brick.cx, brick.cy, t.colors[0], 12 + tier * 8, 150 + tier * 60, 0.5, 3);
    if (t.sparkle) Fx.burst(brick.cx, brick.cy, "#f5d0fe", 18, 220, 0.8, 2);
    if (tier >= 2) Fx.addShake(2 + tier);
    if (pts) Fx.text(brick.cx, brick.cy, `+${pts}`, {
      color: tier >= 2 ? "#fde047" : "#e2e8f0", size: 13 + tier * 4 });
    if (mult > 1 && this.combo % 5 === 0) {
      Fx.text(LW / 2, 130, `COMBO ×${mult}`, { color: "#22d3ee", size: 22 + tier * 6, dy: -20, life: 0.8 });
      Sfx.combo(tier);
    }
    Sfx.brickBreak(this.combo);

    if (t.onDestroy) t.onDestroy(this, brick);
    this.maybeDrop(brick);
    this.updateHud();

    if (this.breakableLeft <= 0 && !this.level.boss) this.levelClear();
  },

  // Explosion damaging bricks within `radius` grid CELLS of (cx, cy) —
  // normalized per axis so a radius of 2 means ~2 bricks in any direction,
  // not 2 brick-widths (which would be ~4 rows vertically).
  explodeAt(cx, cy, radius, source, small) {
    Fx.burst(cx, cy, "#fb923c", small ? 14 : 30, small ? 200 : 340, 0.6, small ? 2.5 : 4);
    Fx.burst(cx, cy, "#fde047", small ? 8 : 16, small ? 140 : 240, 0.5, 2);
    Fx.addShake(small ? 3 : 7);
    if (!small) { Fx.addFlash(0.18, "#fb923c"); Sfx.explosion(); }
    for (const br of this.bricks) {
      if (!br.alive || br === source) continue;
      if (br.type.hp === Infinity) continue;
      if (Math.hypot((br.cx - cx) / BW, (br.cy - cy) / BH) <= radius) this.hitBrick(br, 1, null);
    }
  },

  zapNearby(fromBrick, count) {
    const near = this.bricks
      .filter(br => br.alive && br !== fromBrick && br.type.hp !== Infinity)
      .sort((a, b) => Math.hypot(a.cx - fromBrick.cx, a.cy - fromBrick.cy)
                    - Math.hypot(b.cx - fromBrick.cx, b.cy - fromBrick.cy))
      .slice(0, count);
    for (const br of near) {
      Fx.lightning(fromBrick.cx, fromBrick.cy, br.cx, br.cy);
      this.hitBrick(br, 1, null);
    }
    if (near.length) Sfx.zap();
  },

  /* ================= combo ================= */
  comboMult() {
    if (this.combo >= 25) return 20;
    if (this.combo >= 15) return 10;
    if (this.combo >= 8)  return 5;
    if (this.combo >= 3)  return 2;
    return 1;
  },
  resetCombo() { this.combo = 0; },

  /* ================= power-ups ================= */
  maybeDrop(brick) {
    const t = brick.type;
    if (t.drop === "never") return;
    const chance = this.params.drop * upgradeValue(this.upgrades, "drops", 1);
    if (t.drop !== "always" && Math.random() > chance) return;
    this.dropPowerupAt(brick.cx, brick.cy);
  },

  dropPowerupAt(x, y) {
    const p = pickPowerup(Math.random, upgradeValue(this.upgrades, "rare", 1));
    this.drops.push({ x, y, vy: 40, spin: 0, type: p });
  },

  catchPowerup(p) {
    Sfx.powerup();
    Fx.burst(this.paddle.x, this.paddle.y - 8, p.color, 18, 180, 0.6, 3);
    Fx.text(this.paddle.x, this.paddle.y - 34, p.name, { color: p.color, size: 16 });
    this.score += 25;
    if (p.kind === "instant") { if (p.apply) p.apply(this); }
    else this.applyTimedEffect(p.id, p.dur);
    this.updateHud();
  },

  splitBalls(n) {
    const cur = this.balls.filter(b => !b.stuck);
    const src = cur.length ? cur : this.balls;
    for (const b of src.slice(0, 4)) {
      for (let i = 1; i < n && this.balls.length < 14; i++) {
        const nb = this.spawnBall(false);
        nb.x = b.x; nb.y = b.y;
        const ang = Math.atan2(b.vy || -1, b.vx || 0.2) + (i === 1 ? 0.5 : -0.5);
        const s = this.currentSpeed();
        nb.vx = Math.cos(ang) * s; nb.vy = Math.sin(ang) * s;
      }
      if (b.stuck) this.launchBall(b);
    }
  },

  spawnMultiball() {
    const n = 6 + upgradeValue(this.upgrades, "multi", 0);
    const s = this.currentSpeed();
    for (let i = 0; i < n && this.balls.length < 14; i++) {
      const nb = this.spawnBall(false);
      nb.x = this.paddle.x; nb.y = this.paddle.y - 14;
      const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 1.8;
      nb.vx = Math.cos(a) * s; nb.vy = Math.sin(a) * s;
    }
  },

  /* ================= boss glue ================= */
  collideBoss(b) {
    for (const part of this.boss.ballTargets()) {
      const hit = Physics.circleRect(b.x, b.y, b.r, part.x, part.y, part.w, part.h);
      if (!hit) continue;
      const rf = Physics.reflect(b.vx, b.vy, hit.nx, hit.ny);
      b.vx = rf.vx; b.vy = rf.vy;
      b.x += hit.nx * hit.depth; b.y += hit.ny * hit.depth;
      const u = Physics.unstick(b.vx, b.vy);
      b.vx = u.vx; b.vy = u.vy;
      this.boss.onBallHit(part, b);
      return;
    }
  },

  spawnHazard(hz) { this.hazards.push(Object.assign({ r: 8, vy: 120 }, hz)); },

  bossDefeated() {
    Fx.slowMo(0.25, 0.9);
    Fx.addShake(12); Fx.addFlash(0.4, "#fde047");
    this.score += 5000;
    Sfx.bossDown();
    setTimeout(() => this.levelClear(), 1100);
  },

  /* ================= flow ================= */
  loseLife() {
    this.lives--; this.livesLost++;
    this.resetCombo();
    this.updateHud();
    Fx.addShake(6); Fx.addFlash(0.25, "#f87171");
    if (this.lives <= 0) { this.endLevel(false); return; }
    Sfx.loseBall();
    Fx.text(LW / 2, LH / 2, `${this.lives} ♥ left`, { color: "#f87171", size: 22, life: 1.2 });
    this.spawnBall(true);
  },

  levelClear() {
    if (!this.running) return;
    Fx.slowMo(0.35, 0.6);
    this.endLevel(true);
  },

  endLevel(win) {
    this.running = false;
    if (win) Sfx.levelWin(); else Sfx.lose();
    const stars = win ? (this.livesLost === 0 ? 3 : this.livesLost <= 2 ? 2 : 1) : 0;
    const coins = win ? Math.max(10, Math.round(this.score / 40)) : Math.round(this.score / 150);
    setTimeout(() => App.levelDone({
      win, levelIdx: this.levelIdx, score: this.score, stars, coins,
      comboBest: this.comboBest, boss: !!this.level.boss,
    }), win ? 900 : 500);
  },

  /* ================= pause ================= */
  pause() {
    if (!this.active || !this.running || this.paused) return;
    this.paused = true;
    GK.UI.openModal("modal-pause");
  },
  resume() {
    this.paused = false; this._last = performance.now();
    GK.UI.closeModal("modal-pause");
  },
  togglePause() { this.paused ? this.resume() : this.pause(); },
  quitToMap() { this.running = false; this.paused = false; GK.UI.closeModal("modal-pause"); App.showMap(); },

  /* ================= HUD (DOM) ================= */
  updateHud() {
    const el = id => document.getElementById(id);
    el("hud-score").textContent = this.score.toLocaleString();
    el("hud-level").textContent = this.level.boss ? `☠️ ${this.level.name}` : `Lv ${this.levelIdx + 1}`;
    el("hud-lives").textContent = "♥".repeat(Math.max(0, this.lives));
    const fx = Object.keys(this.effects).map(id => POWERUPS[id] ? POWERUPS[id].icon : "").join(" ");
    el("hud-fx").textContent = fx;
  },
  updateHudCombo() {
    const m = this.comboMult();
    if (m === this._hudMult) return;         // avoid per-frame DOM churn
    this._hudMult = m;
    const el = document.getElementById("hud-combo");
    el.textContent = m > 1 ? `×${m}` : "";
    el.className = "hud combo t" + (m >= 20 ? 3 : m >= 10 ? 2 : m >= 5 ? 1 : 0);
  },

  /* ================= rendering ================= */
  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    this.renderBackground(ctx);

    // playfield space (+ screen shake)
    const shx = Fx.shake ? (Math.random() - 0.5) * Fx.shake : 0;
    const shy = Fx.shake ? (Math.random() - 0.5) * Fx.shake : 0;
    ctx.setTransform(this.DPR * this.scale, 0, 0, this.DPR * this.scale,
                     this.DPR * (this.offX + shx * this.scale), this.DPR * (this.offY + shy * this.scale));

    // playfield frame
    ctx.strokeStyle = `hsla(${this.worldHue || 200}, 90%, 60%, .5)`;
    ctx.lineWidth = 2;
    ctx.strokeRect(-1, -1, LW + 2, LH + 2);

    for (const br of this.bricks) if (br.alive) this.renderBrick(ctx, br);
    if (this.boss) this.boss.render(ctx);

    // hazards
    for (const hz of this.hazards) {
      ctx.fillStyle = hz.color || "#f87171";
      ctx.beginPath(); ctx.arc(hz.x, hz.y, hz.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.beginPath(); ctx.arc(hz.x - hz.r * 0.3, hz.y - hz.r * 0.3, hz.r * 0.3, 0, Math.PI * 2); ctx.fill();
    }

    // lasers
    ctx.fillStyle = "#f43f5e";
    for (const l of this.lasers) ctx.fillRect(l.x - 1.5, l.y - 9, 3, 12);

    // falling power-ups
    for (const d of this.drops) this.renderDrop(ctx, d);

    Fx.render(ctx);

    // balls
    for (const b of this.balls) {
      ctx.fillStyle = this.ballColor();
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.65)";
      ctx.beginPath(); ctx.arc(b.x - 2, b.y - 2, b.r * 0.4, 0, Math.PI * 2); ctx.fill();
    }

    this.renderPaddle(ctx);

    // shield line
    if (this.effects.shield) {
      ctx.strokeStyle = "rgba(45,212,191,.8)"; ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.beginPath(); ctx.moveTo(0, LH - 3); ctx.lineTo(LW, LH - 3); ctx.stroke();
      ctx.setLineDash([]);
    }

    // boss HP bar
    if (this.boss) {
      const frac = Math.max(0, this.boss.hpFrac());
      ctx.fillStyle = "rgba(15,23,42,.7)";
      ctx.fillRect(60, 10, LW - 120, 10);
      ctx.fillStyle = frac > 0.35 ? "#f43f5e" : "#fde047";
      ctx.fillRect(61, 11, (LW - 122) * frac, 8);
      ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = 1;
      ctx.strokeRect(60, 10, LW - 120, 10);
    }

    // full-screen flash
    if (Fx.flash > 0) {
      ctx.globalAlpha = Fx.flash;
      ctx.fillStyle = Fx.flashColor;
      ctx.fillRect(0, 0, LW, LH);
      ctx.globalAlpha = 1;
    }
  },

  renderBackground(ctx) {
    const w = this.viewW, h = this.viewH;
    const hue = this.worldHue || 200;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `hsl(${hue}, 55%, 8%)`);
    g.addColorStop(1, `hsl(${hue + 40}, 55%, 13%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const t = performance.now() / 1000;
    for (const s of this.stars) {
      const y = (s.y + t * s.sp) % h;
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 2 + s.tw);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(s.x, y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  },

  renderBrick(ctx, br) {
    ctx.drawImage(this.brickSprite(br), br.x, br.y, br.w, br.h);
    if (br.flash > 0) {
      ctx.globalAlpha = Math.min(1, br.flash) * 0.7;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(br.x + 1, br.y + 1, br.w - 2, br.h - 2);
      ctx.globalAlpha = 1;
    }
    if (br.fuse > 0) {   // armed bomb blinks faster as it burns down
      ctx.globalAlpha = (Math.sin(performance.now() / (40 + br.fuse * 90)) + 1) / 2 * 0.8;
      ctx.fillStyle = "#f87171";
      ctx.fillRect(br.x + 1, br.y + 1, br.w - 2, br.h - 2);
      ctx.globalAlpha = 1;
    }
  },

  // Pre-rendered brick faces (rounded rect + glow + glyph + damage cracks),
  // cached per type/damage at the current pixel scale — glow is expensive,
  // so it must never run per-frame.
  brickSprite(br) {
    const dmg = br.maxHp === Infinity ? 0 : br.maxHp - br.hp;
    const key = br.ch + ":" + dmg;
    let cv = this.spriteCache.get(key);
    if (cv) return cv;
    const px = Math.max(1, this.scale * this.DPR);
    cv = document.createElement("canvas");
    cv.width = Math.ceil(BW * px); cv.height = Math.ceil(BH * px);
    const c = cv.getContext("2d");
    c.scale(px, px);
    const t = br.type, w = BW - 2, h = BH - 2;
    c.translate(1, 1);
    const grad = c.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, t.colors[1]); grad.addColorStop(0.5, t.colors[0]);
    grad.addColorStop(1, GK.util.shade(t.colors[0], -35));
    c.shadowColor = t.colors[0]; c.shadowBlur = 6 * px;
    c.fillStyle = grad;
    c.beginPath();
    if (c.roundRect) c.roundRect(0, 0, w, h, 4); else c.rect(0, 0, w, h);
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = "rgba(255,255,255,.25)";
    c.fillRect(2, 1.5, w - 4, 2.5);
    if (t.glyph) {
      c.font = `700 ${h * 0.62}px sans-serif`;
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillStyle = "rgba(255,255,255,.9)";
      c.fillText(t.glyph, w / 2, h / 2 + 1);
    }
    // damage cracks
    c.strokeStyle = "rgba(0,0,0,.55)"; c.lineWidth = 1;
    for (let i = 0; i < dmg; i++) {
      const x0 = 5 + ((i * 37) % (w - 10));
      c.beginPath();
      c.moveTo(x0, 2); c.lineTo(x0 + 4, h * 0.4); c.lineTo(x0 - 2, h * 0.7); c.lineTo(x0 + 3, h - 2);
      c.stroke();
    }
    this.spriteCache.set(key, cv);
    return cv;
  },

  renderDrop(ctx, d) {
    const wob = Math.sin(d.spin) * 0.2;
    ctx.save();
    ctx.translate(d.x, d.y); ctx.rotate(wob);
    ctx.fillStyle = d.type.color;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-13, -9, 26, 18, 8); else ctx.rect(-13, -9, 26, 18);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.3)";
    ctx.fillRect(-10, -7, 20, 4);
    ctx.font = "700 10px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(d.type.icon, 0, 1);
    ctx.restore();
  },

  renderPaddle(ctx) {
    const p = this.paddle;
    const sq = 1 + (p.squash || 0) * 0.35;          // squash: wider + flatter on hit
    const w = p.w * sq, h = 13 / sq;
    const stunned = p.stun > 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, stunned ? "#fca5a5" : "#67e8f9");
    grad.addColorStop(1, stunned ? "#b91c1c" : "#0891b2");
    ctx.shadowColor = stunned ? "#f87171" : "#22d3ee";
    ctx.shadowBlur = 12;
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, h / 2); else ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (this.effects.sticky) {
      ctx.fillStyle = "rgba(250,204,21,.75)";
      ctx.fillRect(-w / 2 + 4, -h / 2 - 1.5, w - 8, 3);
    }
    if (this.effects.laser) {
      ctx.fillStyle = "#f43f5e";
      ctx.fillRect(-w / 2 - 2, -h / 2 - 4, 5, 7);
      ctx.fillRect(w / 2 - 3, -h / 2 - 4, 5, 7);
    }
    if (this.effects.magnet) {
      ctx.strokeStyle = "rgba(192,132,252,.5)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, w / 2 + 10, Math.PI, 0); ctx.stroke();
    }
    ctx.restore();
  },
};

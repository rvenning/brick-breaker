// Boss framework. The engine only knows this contract:
//   update(dt)        advance movement/attacks (spawn hazards via game.spawnHazard)
//   render(ctx)       draw in logical playfield coords
//   ballTargets()     rects the ball can bounce off: {x,y,w,h,part fields...}
//   onBallHit(part, ball)   apply damage / clank
//   laserHit(l)       optional: laser projectile hit test, returns true if consumed
//   hpFrac()          0..1 for the HUD bar
//   dead              set true after defeat (engine stops updating)
//
// A new boss = Bosses.register("key", game => ({...})) + a level entry
// { boss: "key" } in js/levels.js.

const Bosses = {
  types: {},
  register(key, factory) { this.types[key] = factory; },
  create(key, game) {
    const b = this.types[key](game);
    b.dead = false;
    return b;
  },
};

/* ---------- shared helpers ---------- */

// Standard weak-spot damage handling shared by every boss.
function damagePart(game, boss, part, dmg) {
  part.hp -= dmg;
  part.flash = 1;
  Fx.burst(part.x + part.w / 2, part.y + part.h / 2, part.color || "#fde047", 16, 200, 0.5, 3);
  Fx.addShake(4);
  Sfx.bossHit();
  // boss levels have no bricks, so weak-spot damage is the power-up source:
  // every 3rd hit on a weak part shakes a power-up loose
  if (part.hp > 0 && (part.max - part.hp) % 3 === 0)
    game.dropPowerupAt(part.x + part.w / 2, part.y + part.h + 6);
  game.combo++; game.comboBest = Math.max(game.comboBest, game.combo);
  game.score += Math.round(150 * game.comboMult());
  if (part.hp <= 0) {
    part.alive = false;
    Fx.burst(part.x + part.w / 2, part.y + part.h / 2, "#fde047", 40, 320, 0.9, 4);
    Fx.addShake(9); Fx.addFlash(0.25, "#fde047");
    Fx.slowMo(0.35, 0.45);
    Sfx.explosion();
    if (boss.onPartDestroyed) boss.onPartDestroyed(part);
    if (boss.weakParts().every(p => !p.alive)) {
      boss.dead = true;
      game.bossDefeated();
    }
  }
  game.updateHud();
}

function clank(game, part, ball) {
  Sfx.steel();
  Fx.burst(ball ? ball.x : part.x + part.w / 2, ball ? ball.y : part.y, "#94a3b8", 5, 90, 0.3, 2);
}

// Rect helper for parts.
function P(x, y, w, h, extra) { return Object.assign({ x, y, w, h, alive: true, flash: 0, hp: 1 }, extra); }

function tickFlashes(parts, dt) { for (const p of parts) if (p.flash > 0) p.flash -= dt * 5; }

function drawPart(ctx, p, base, glow) {
  ctx.shadowColor = glow || base; ctx.shadowBlur = 10;
  ctx.fillStyle = p.flash > 0 ? "#ffffff" : base;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(p.x, p.y, p.w, p.h, 4); else ctx.rect(p.x, p.y, p.w, p.h);
  ctx.fill();
  ctx.shadowBlur = 0;
}

/* ================= Boss 1 — Brick Golem ================= */
// A giant face of armored blocks; destroy both eyes. Spits fireballs, sweeps
// a telegraphed beam, and shakes bricks loose from the ceiling.

Bosses.register("golem", (game) => {
  const EYE_HP = 6;
  const body = [];
  // face: 8×5 armored blocks centred, with mouth gap and open shafts under
  // the eyes so balls and lasers can actually reach them from below
  for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
    if ((c === 2 || c === 5) && r >= 1) continue;           // eye + shaft below it
    if (r === 3 && c >= 2 && c <= 5) continue;              // mouth
    body.push(P(70 + c * 35, 60 + r * 22, 33, 20, { armored: true }));
  }
  const eyes = [
    P(70 + 2 * 35, 60 + 22, 33, 20, { weak: true, hp: EYE_HP, max: EYE_HP, color: "#fde047" }),
    P(70 + 5 * 35, 60 + 22, 33, 20, { weak: true, hp: EYE_HP, max: EYE_HP, color: "#fde047" }),
  ];
  const parts = body.concat(eyes);
  let sway = 0, atkT = 2.2, atk = 0, beamX = null, beamT = 0;
  const baseX = parts.map(p => p.x);

  return {
    name: "Brick Golem",
    weakParts: () => eyes,
    ballTargets: () => parts.filter(p => p.alive),
    hpFrac: () => eyes.reduce((s, e) => s + Math.max(0, e.hp), 0) / (EYE_HP * 2),

    onBallHit(part, ball) {
      if (part.weak) damagePart(game, this, part, game.ballDamage() > 1 ? 2 : 1);
      else clank(game, part, ball);
    },
    laserHit(l) {
      for (const p of parts) {
        if (!p.alive) continue;
        if (l.x > p.x && l.x < p.x + p.w && l.y > p.y && l.y < p.y + p.h) {
          if (p.weak) damagePart(game, this, p, 1); else clank(game, p, null);
          return true;
        }
      }
      return false;
    },

    update(dt) {
      sway += dt;
      const dx = Math.sin(sway * 0.7) * 26;
      parts.forEach((p, i) => { p.x = baseX[i] + dx; });
      tickFlashes(parts, dt);

      const rage = this.hpFrac() < 0.5 ? 0.65 : 1;   // phase 2: faster attacks
      atkT -= dt;
      if (beamX !== null) {
        beamT -= dt;
        if (beamT < 0.6 && beamT + dt >= 0.6) {      // beam fires after telegraph
          game.spawnHazard({ x: beamX + dx, y: 175, vy: 460, r: 10, color: "#fde047" });
          Sfx.bossBeam();
        }
        if (beamT <= 0) beamX = null;
      }
      if (atkT <= 0) {
        atk = (atk + 1) % 3;
        atkT = 3.1 * rage;
        if (atk === 0) {          // fireball spit from the mouth, aimed at paddle
          const mx = 210 + dx, my = 150;
          const a = Math.atan2(game.paddle.y - my, game.paddle.x - mx);
          game.spawnHazard({ x: mx, y: my, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, r: 8, color: "#fb923c" });
          Sfx.bossShoot();
        } else if (atk === 1) {   // telegraphed beam
          beamX = 60 + Math.random() * 300;
          beamT = 1.2;
          Sfx.bossWarn();
        } else {                  // drop bricks
          for (let i = 0; i < 2 + (rage < 1 ? 1 : 0); i++)
            game.spawnHazard({ x: 40 + Math.random() * 340, y: 40, vy: 150 + Math.random() * 80, r: 9, color: "#a78bfa" });
          Fx.addShake(5);
          Sfx.bossShoot();
        }
      }
    },

    render(ctx) {
      for (const p of body) if (p.alive) drawPart(ctx, p, "#64748b", "#334155");
      for (const e of eyes) {
        if (!e.alive) { drawPart(ctx, e, "#1e293b"); continue; }
        drawPart(ctx, e, "#facc15", "#fde047");
        ctx.fillStyle = "#7c2d12";
        ctx.beginPath(); ctx.arc(e.x + e.w / 2, e.y + e.h / 2, 5, 0, Math.PI * 2); ctx.fill();
      }
      // mouth glow
      ctx.fillStyle = "rgba(251,146,60,.35)";
      const dx = Math.sin(sway * 0.7) * 26;
      ctx.fillRect(140 + dx, 126, 140, 20);
      // beam telegraph
      if (beamX !== null && beamT > 0.6) {
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(performance.now() / 60);
        ctx.fillStyle = "#fde047";
        ctx.fillRect(beamX + dx - 6, 170, 12, LH - 170);
        ctx.globalAlpha = 1;
      }
    },
  };
});

/* ================= Boss 2 — UFO ================= */
// Saucer sweeping the top. Its reactor hatch opens on a cycle — only then is
// it vulnerable. Drops bombs and releases drones.

Bosses.register("ufo", (game) => {
  const REACTOR_HP = 10;
  const hull = P(0, 70, 130, 26, { armored: true });
  const dome = P(0, 52, 60, 20, { armored: true });
  const reactor = P(0, 96, 56, 16, { weak: true, hp: REACTOR_HP, max: REACTOR_HP, color: "#5eead4" });
  const drones = [];
  let t = 0, atkT = 2.5, hatch = 0;   // hatch > 0 = open

  const place = () => {
    const cx = 210 + Math.sin(t * 0.55) * 130;
    hull.x = cx - 65; dome.x = cx - 30; reactor.x = cx - 28;
  };

  return {
    name: "UFO",
    weakParts: () => [reactor],
    ballTargets() {
      const list = [hull, dome].filter(p => p.alive);
      if (hatch > 0) list.push(reactor);
      return list.concat(drones.filter(d => d.alive));
    },
    hpFrac: () => Math.max(0, reactor.hp) / REACTOR_HP,

    onBallHit(part, ball) {
      if (part === reactor) damagePart(game, this, part, game.ballDamage() > 1 ? 2 : 1);
      else if (part.drone) {
        part.hp -= 1; part.flash = 1;
        if (part.hp <= 0) {
          part.alive = false;
          game.score += 250;
          Fx.burst(part.x + part.w / 2, part.y + part.h / 2, "#a5b4fc", 18, 220, 0.6, 3);
          Sfx.explosion();
          game.dropPowerupAt(part.x + part.w / 2, part.y + part.h / 2);
        } else Sfx.bossHit();
      }
      else clank(game, part, ball);
    },
    laserHit(l) {
      const targets = this.ballTargets();
      for (const p of targets) {
        if (l.x > p.x && l.x < p.x + p.w && l.y > p.y && l.y < p.y + p.h) {
          this.onBallHit(p, null);
          return true;
        }
      }
      return false;
    },

    update(dt) {
      t += dt;
      place();
      tickFlashes([hull, dome, reactor, ...drones], dt);

      // hatch cycle: ~2.2s closed, 3.2s open (even longer when hurt)
      const cycle = 5.4, open = this.hpFrac() < 0.5 ? 3.8 : 3.2;
      hatch = (t % cycle) > (cycle - open) ? 1 : 0;

      for (let i = drones.length - 1; i >= 0; i--) {
        const d = drones[i];
        if (!d.alive) { drones.splice(i, 1); continue; }
        d.y += Math.sin(t * 2 + d.seed) * 14 * dt + 26 * dt;
        d.x += Math.cos(t * 1.4 + d.seed) * 50 * dt;
        if (d.y > LH - 140) d.y = LH - 140;
      }

      atkT -= dt;
      if (atkT <= 0) {
        atkT = this.hpFrac() < 0.5 ? 1.7 : 2.4;
        const roll = Math.random();
        if (roll < 0.45) {          // bomb drop
          game.spawnHazard({ x: hull.x + 65, y: 100, vy: 120, r: 9, color: "#f87171" });
          Sfx.bossShoot();
        } else if (roll < 0.75 && drones.length < 3) {   // release a drone
          drones.push(P(hull.x + 65 - 12, 110, 24, 16, { drone: true, weak: false, hp: 2, seed: Math.random() * 9, color: "#a5b4fc" }));
          Sfx.bossWarn();
        } else {                    // twin laser burst straight down
          game.spawnHazard({ x: hull.x + 18, y: 100, vy: 340, r: 6, color: "#f43f5e" });
          game.spawnHazard({ x: hull.x + 112, y: 100, vy: 340, r: 6, color: "#f43f5e" });
          Sfx.bossBeam();
        }
      }
    },

    render(ctx) {
      drawPart(ctx, dome, "#c4b5fd", "#a78bfa");
      drawPart(ctx, hull, "#818cf8", "#6366f1");
      // running lights
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = (Math.floor(t * 4) + i) % 5 === 0 ? "#fde047" : "#312e81";
        ctx.beginPath(); ctx.arc(hull.x + 18 + i * 24, hull.y + 13, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      if (hatch > 0) {
        drawPart(ctx, reactor, "#2dd4bf", "#5eead4");
        ctx.fillStyle = "rgba(255,255,255,.7)";
        ctx.beginPath(); ctx.arc(reactor.x + reactor.w / 2, reactor.y + reactor.h / 2, 4 + Math.sin(t * 6) * 1.5, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = "#475569";
        ctx.fillRect(reactor.x, reactor.y, reactor.w, 6);
      }
      for (const d of drones) if (d.alive) {
        drawPart(ctx, d, "#a5b4fc", "#818cf8");
        ctx.fillStyle = "#f43f5e";
        ctx.beginPath(); ctx.arc(d.x + d.w / 2, d.y + d.h + 2, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    },
  };
});

/* ================= Boss 3 — Lava Core ================= */
// A rotating crystal shielded by four orbiting generators: kill the
// generators, then crack the core.

Bosses.register("core", (game) => {
  const CORE_HP = 14, GEN_HP = 4;
  const core = P(210 - 26, 130 - 26, 52, 52, { weak: true, hp: CORE_HP, max: CORE_HP, color: "#f5d0fe" });
  const gens = [0, 1, 2, 3].map(i =>
    P(0, 0, 26, 26, { weak: true, gen: true, hp: GEN_HP, max: GEN_HP, seed: i, color: "#fb923c" }));
  let t = 0, atkT = 2.6, spin = 0;

  const shielded = () => gens.some(g => g.alive);

  return {
    name: "Lava Core",
    weakParts: () => [core],
    ballTargets: () => gens.filter(g => g.alive).concat(core.alive ? [core] : []),
    hpFrac: () => (Math.max(0, core.hp) + gens.reduce((s, g) => s + Math.max(0, g.hp), 0))
                / (CORE_HP + GEN_HP * 4),

    onBallHit(part, ball) {
      const dmg = game.ballDamage() > 1 ? 2 : 1;
      if (part.gen) {
        part.hp -= dmg; part.flash = 1;
        Fx.burst(part.x + 13, part.y + 13, "#fb923c", 14, 190, 0.5, 3);
        Sfx.bossHit();
        game.score += Math.round(100 * game.comboMult());
        if (part.hp <= 0) {
          part.alive = false;
          Fx.burst(part.x + 13, part.y + 13, "#fde047", 30, 280, 0.8, 4);
          Fx.addShake(7); Sfx.explosion();
          game.dropPowerupAt(part.x + 13, part.y + 13);
          if (!shielded()) { Fx.addFlash(0.3, "#f5d0fe"); Sfx.bossWarn(); Fx.text(LW / 2, 200, "CORE EXPOSED!", { color: "#f5d0fe", size: 22 }); }
        }
        game.updateHud();
      } else if (part === core) {
        if (shielded()) { clank(game, part, ball); Fx.text(core.x + 26, core.y - 12, "SHIELDED", { color: "#94a3b8", size: 12 }); }
        else damagePart(game, this, part, dmg);
      }
    },
    laserHit(l) {
      for (const p of this.ballTargets()) {
        if (l.x > p.x && l.x < p.x + p.w && l.y > p.y && l.y < p.y + p.h) {
          this.onBallHit(p, null);
          return true;
        }
      }
      return false;
    },

    update(dt) {
      t += dt; spin += dt * (shielded() ? 0.8 : 2.2);
      const cx = 210, cy = 140, R = 86;
      gens.forEach((g, i) => {
        const a = spin * 0.9 + i * Math.PI / 2;
        g.x = cx + Math.cos(a) * R - 13; g.y = cy + Math.sin(a) * R * 0.62 - 13;
      });
      core.x = cx - 26 + Math.sin(t * 3) * 2; core.y = cy - 26;
      tickFlashes(gens.concat([core]), dt);

      atkT -= dt;
      if (atkT <= 0) {
        const rage = !shielded();
        atkT = rage ? 1.6 : 2.6;
        if (Math.random() < 0.5) {    // radial ring
          const n = rage ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI + (Math.random() * 0.3);
            game.spawnHazard({ x: cx, y: cy, vx: Math.cos(a) * 150, vy: Math.abs(Math.sin(a)) * 150 + 60, r: 7, color: "#fb923c" });
          }
          Sfx.bossShoot();
        } else {                      // aimed lava blob
          const a = Math.atan2(game.paddle.y - cy, game.paddle.x - cx);
          game.spawnHazard({ x: cx, y: cy, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, r: 10, color: "#f87171" });
          Sfx.bossShoot();
        }
      }
    },

    render(ctx) {
      const cx = core.x + 26, cy = core.y + 26;
      // crystal core (rotating diamond)
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(spin);
      ctx.shadowColor = "#e879f9"; ctx.shadowBlur = 16;
      ctx.fillStyle = core.flash > 0 ? "#fff" : (shielded() ? "#a21caf" : "#e879f9");
      ctx.beginPath();
      ctx.moveTo(0, -30); ctx.lineTo(22, 0); ctx.lineTo(0, 30); ctx.lineTo(-22, 0);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(22, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
      // shield ring
      if (shielded()) {
        ctx.strokeStyle = "rgba(45,212,191,.45)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(210, 140, 96, 62, 0, 0, Math.PI * 2); ctx.stroke();
      }
      for (const g of gens) if (g.alive) {
        drawPart(ctx, g, "#fb923c", "#fdba74");
        ctx.fillStyle = "#7c2d12";
        ctx.beginPath(); ctx.arc(g.x + 13, g.y + 13, 4, 0, Math.PI * 2); ctx.fill();
      }
    },
  };
});

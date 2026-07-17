// Juice layer: pooled particles, screen shake, floating text, flashes,
// slow-motion and a lightweight tween helper. All rendering happens in the
// game's logical coordinate space; Game calls Fx.update(dt) + Fx.render(ctx).

const Fx = {
  parts: [],      // particle pool (recycled)
  texts: [],      // floating score/combo popups
  bolts: [],      // short-lived lightning polylines
  shake: 0,       // current shake magnitude (logical px)
  flash: 0,       // full-screen flash alpha
  flashColor: "#ffffff",
  timeScale: 1,   // <1 = slow motion
  slowT: 0,

  reset() { this.parts.length = 0; this.texts.length = 0; this.bolts.length = 0;
            this.shake = 0; this.flash = 0; this.timeScale = 1; this.slowT = 0; },

  /* ---- emitters ---- */
  burst(x, y, color, n = 12, speed = 160, life = 0.5, size = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.65);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.4), t: 0, color, size: size * (0.6 + Math.random() * 0.8),
        grav: 260, spark: Math.random() < 0.3 });
    }
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
  },

  trail(x, y, color, size = 2.5) {
    this.parts.push({ x, y, vx: 0, vy: 0, life: 0.28, t: 0, color, size, grav: 0, fadeOnly: true });
  },

  text(x, y, str, { color = "#fff", size = 16, dy = -46, life = 0.9 } = {}) {
    this.texts.push({ x, y, str, color, size, dy, life, t: 0 });
    if (this.texts.length > 40) this.texts.shift();
  },

  lightning(x1, y1, x2, y2, color = "#fde047") {
    const pts = [[x1, y1]];
    const segs = 6;
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      pts.push([x1 + (x2 - x1) * t + (Math.random() - 0.5) * 16,
                y1 + (y2 - y1) * t + (Math.random() - 0.5) * 16]);
    }
    pts.push([x2, y2]);
    this.bolts.push({ pts, color, life: 0.16, t: 0 });
  },

  addShake(amount) { this.shake = Math.min(14, this.shake + amount); },
  addFlash(alpha, color = "#ffffff") { this.flash = Math.max(this.flash, alpha); this.flashColor = color; },
  slowMo(scale = 0.3, dur = 0.5) { this.timeScale = scale; this.slowT = dur; },

  /* ---- frame ---- */
  update(dt) {   // dt = REAL seconds (slow-mo must not slow its own recovery)
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.timeScale = 1; }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 26);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.2);
    const sdt = dt * this.timeScale;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += sdt;
      if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * sdt; p.y += p.vy * sdt; p.vy += p.grav * sdt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      if (t.t >= t.life) this.texts.splice(i, 1);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      if (b.t >= b.life) this.bolts.splice(i, 1);
    }
  },

  render(ctx) {
    for (const p of this.parts) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      const s = p.size * (p.fadeOnly ? k : 1);
      if (p.spark) ctx.fillRect(p.x - s / 2, p.y - s * 1.5, s * 0.7, s * 3);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    for (const b of this.bolts) {
      ctx.globalAlpha = 1 - b.t / b.life;
      ctx.strokeStyle = b.color; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.pts[0][0], b.pts[0][1]);
      for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i][0], b.pts[i][1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const t of this.texts) {
      const k = t.t / t.life;
      const pop = k < 0.15 ? k / 0.15 : 1;             // scale-in pop
      ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      ctx.font = `800 ${Math.round(t.size * (0.6 + 0.4 * pop))}px 'Baloo 2',sans-serif`;
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y + t.dy * k);
    }
    ctx.globalAlpha = 1;
  },
};

// Minimal tween runner for UI/paddle squash (value objects, ease-out).
const Tween = {
  list: [],
  to(obj, props, dur, ease = t => 1 - Math.pow(1 - t, 3)) {
    const from = {};
    for (const k in props) from[k] = obj[k];
    this.list.push({ obj, from, to: props, dur, t: 0, ease });
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur), e = tw.ease(k);
      for (const key in tw.to) tw.obj[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
      if (k >= 1) this.list.splice(i, 1);
    }
  },
  clear() { this.list.length = 0; },
};

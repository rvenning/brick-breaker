// Sound design — gamekit synth core (lib/gk-audio.js) plus Brick Breaker's
// own layered arcade sounds. Everything synthesized, no audio files.
// click/coin/win/lose/wrong come from the kit defaults.
const Sfx = GK.Sfx;

Object.assign(Sfx, {
  // Brick impact — pitch rises with the combo so streaks *sound* like streaks.
  brickHit(combo = 0) {
    const step = Math.min(combo, 12);
    this.tone({ freq: 340 * Math.pow(2, step / 24), type: "square", dur: 0.05, vol: 0.1 });
  },
  brickBreak(combo = 0) {
    const step = Math.min(combo, 16);
    const f = 440 * Math.pow(2, step / 24);
    this.tone({ freq: f, type: "triangle", dur: 0.09, vol: 0.2 });
    this.tone({ freq: f * 1.5, type: "sine", dur: 0.12, vol: 0.12, when: 0.03 });
    this.noise({ dur: 0.05, vol: 0.06 });
  },
  combo(tier = 0) {
    [660, 880, 1100 + tier * 130].forEach((f, i) =>
      this.tone({ freq: f, type: "triangle", dur: 0.1, vol: 0.16, when: i * 0.05 }));
  },
  paddle()  { this.tone({ freq: 220, type: "sine", dur: 0.06, vol: 0.18, slide: 60 }); },
  wall()    { this.tone({ freq: 180, type: "sine", dur: 0.04, vol: 0.1 }); },
  steel()   { this.tone({ freq: 1200, type: "square", dur: 0.03, vol: 0.07 });
              this.tone({ freq: 900, type: "square", dur: 0.04, vol: 0.05, when: 0.02 }); },
  launch()  { this.tone({ freq: 330, type: "triangle", dur: 0.12, vol: 0.2, slide: 220 }); },
  stick()   { this.tone({ freq: 500, type: "sine", dur: 0.1, vol: 0.15, slide: -160 }); },
  laser()   { this.tone({ freq: 880, type: "sawtooth", dur: 0.07, vol: 0.08, slide: -420 }); },
  zap()     { this.tone({ freq: 1400, type: "sawtooth", dur: 0.06, vol: 0.09, slide: -800 });
              this.noise({ dur: 0.04, vol: 0.05 }); },
  portal()  { this.tone({ freq: 520, type: "sine", dur: 0.16, vol: 0.16, slide: 400 });
              this.tone({ freq: 780, type: "sine", dur: 0.14, vol: 0.12, when: 0.08, slide: 300 }); },
  powerup() { [523, 784, 1047].forEach((f, i) =>
                this.tone({ freq: f, type: "triangle", dur: 0.1, vol: 0.18, when: i * 0.05 })); },
  explosion() {
    this.noise({ dur: 0.35, vol: 0.28 });
    this.tone({ freq: 90, type: "sawtooth", dur: 0.3, vol: 0.22, slide: -40 });
  },
  sfxFuse() { this.tone({ freq: 1000, type: "square", dur: 0.04, vol: 0.08 }); },
  shieldSave() { this.tone({ freq: 400, type: "sine", dur: 0.18, vol: 0.2, slide: 350 }); },
  paddleHit()  { this.tone({ freq: 200, type: "sawtooth", dur: 0.2, vol: 0.18, slide: -120 });
                 this.noise({ dur: 0.12, vol: 0.1 }); },
  loseBall()   { this.tone({ freq: 300, type: "sine", dur: 0.25, vol: 0.2, slide: -180 }); },

  levelWin() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      this.tone({ freq: f, type: "triangle", dur: 0.2, vol: 0.2, when: i * 0.1 }));
  },

  /* --- boss --- */
  bossHit()   { this.tone({ freq: 260, type: "square", dur: 0.1, vol: 0.16, slide: -80 }); },
  bossShoot() { this.tone({ freq: 240, type: "sawtooth", dur: 0.12, vol: 0.12, slide: -100 }); },
  bossWarn()  { this.tone({ freq: 440, type: "square", dur: 0.14, vol: 0.14 });
                this.tone({ freq: 440, type: "square", dur: 0.14, vol: 0.14, when: 0.2 }); },
  bossBeam()  { this.tone({ freq: 700, type: "sawtooth", dur: 0.25, vol: 0.14, slide: -500 });
                this.noise({ dur: 0.2, vol: 0.08 }); },
  bossDown() {
    this.noise({ dur: 0.5, vol: 0.3 });
    [880, 660, 440, 220].forEach((f, i) =>
      this.tone({ freq: f, type: "sawtooth", dur: 0.25, vol: 0.2, when: i * 0.12, slide: -60 }));
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, type: "triangle", dur: 0.22, vol: 0.2, when: 0.7 + i * 0.1 }));
  },

  // Minimal boss "music": a pulsing two-note bass loop scheduled while a boss
  // level runs (started/stopped by main.js; survives pause via clearInterval).
  _bossLoop: null,
  startBossMusic() {
    if (this._bossLoop) return;
    let step = 0;
    const seq = [55, 55, 65.4, 55, 55, 49, 65.4, 73.4];
    this._bossLoop = setInterval(() => {
      if (!this.enabled || !Game.running || Game.paused) return;
      this.tone({ freq: seq[step % seq.length], type: "sawtooth", dur: 0.22, vol: 0.1 });
      if (step % 2 === 0) this.tone({ freq: seq[step % seq.length] * 4, type: "square", dur: 0.08, vol: 0.04 });
      step++;
    }, 280);
  },
  stopBossMusic() {
    if (this._bossLoop) { clearInterval(this._bossLoop); this._bossLoop = null; }
  },
});

// game.js calls game.sfxFuse(brick) via the bomb brick behavior
Game.sfxFuse = function () { Sfx.sfxFuse(); };

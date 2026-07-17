// Generates Brick Breaker DX's PWA icons using the kit's PNG painter.
// A neon brick wall with a cyan paddle and a glowing white ball on the game's
// dark navy field. Run: node tools/make-icons.js  (from the game folder)
const fs = require("fs");
const path = require("path");
const { makeCanvas, downsample, encodePNG } = require("../lib/tools/png.js");

const NAVY = "#0b1020";
const NAVY_LT = "#1a2342";
const ROWS = ["#38bdf8", "#a78bfa", "#f472b6", "#fb923c"];
const PADDLE = "#22d3ee";
const PADDLE_DK = "#0e7490";
const BALL = "#f8fafc";

// `scale` shrinks the whole motif toward the centre (maskable keeps art ~72%).
function drawIcon(size, scale) {
  const SS = 4, big = size * SS;
  const cv = makeCanvas(big);

  // Rounded dark field with a subtle lighter glow up top.
  cv.fillRoundRect(0, 0, big, big, big * 0.22, NAVY);
  cv.fillRoundRect(0, 0, big, big * 0.5, big * 0.22, NAVY_LT, 0.5);

  const cx = big / 2;
  const wallW = big * 0.72 * scale;
  const brickW = wallW / 4, brickH = big * 0.085 * scale, gap = big * 0.012 * scale;
  const wallX = cx - wallW / 2, wallY = big * 0.14 + (1 - scale) * big * 0.1;

  // Four rows of neon bricks (staggered like a real wall), one gap knocked out.
  for (let r = 0; r < 4; r++) {
    const off = (r % 2) * brickW * 0.5;
    for (let c = -1; c < 5; c++) {
      const x = wallX + c * brickW + off;
      if (x + brickW < wallX || x > wallX + wallW) continue;
      if (r === 3 && c === 2) continue;                       // the broken brick
      const x0 = Math.max(x, wallX), x1 = Math.min(x + brickW - gap, wallX + wallW);
      if (x1 <= x0) continue;
      // soft glow pass then the brick face
      cv.fillRoundRect(x0 - gap, wallY + r * (brickH + gap) - gap, x1 - x0 + gap * 2, brickH + gap * 2, brickH * 0.3, ROWS[r], 0.25);
      cv.fillRoundRect(x0, wallY + r * (brickH + gap), x1 - x0, brickH, brickH * 0.25, ROWS[r]);
    }
  }

  // Glowing ball flying toward the gap.
  const bx = cx + brickW * 0.5, by = big * 0.62;
  cv.fillCircle(bx, by, big * 0.075 * scale, BALL, 0.25);   // halo
  cv.fillCircle(bx, by, big * 0.045 * scale, BALL);

  // Cyan paddle at the bottom.
  const pw = big * 0.34 * scale, ph = big * 0.05 * scale, py = big * 0.82;
  cv.fillRoundRect(cx - pw / 2, py + ph * 0.45, pw, ph, ph / 2, PADDLE_DK);   // under-shadow
  cv.fillRoundRect(cx - pw / 2, py, pw, ph, ph / 2, PADDLE);

  return encodePNG(size, size, downsample(cv.px, big, SS));
}

const out = path.join(__dirname, "..", "icons");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "icon-512.png"), drawIcon(512, 1.0));
fs.writeFileSync(path.join(out, "icon-192.png"), drawIcon(192, 1.0));
fs.writeFileSync(path.join(out, "maskable-512.png"), drawIcon(512, 0.78));
console.log("Brick Breaker DX icons written");

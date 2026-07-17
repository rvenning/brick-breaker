// Pure ball-physics helpers — no game state, no DOM, so they load in Node
// (tests/physics.test.js) as well as the browser.

const Physics = {
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },

  // Where the ball meets the paddle decides the exit angle: centre = straight
  // up, edges = steep (max ~62° from vertical). Always exits upward.
  paddleBounce(ballX, paddleX, paddleW, speed) {
    const rel = this.clamp((ballX - paddleX) / (paddleW / 2), -1, 1);
    const angle = rel * 1.08;
    return { vx: Math.sin(angle) * speed, vy: -Math.cos(angle) * speed };
  },

  // Anti-loop guarantees: never flatter than 18% vertical (endless horizontal
  // ping-pong) and never steeper than 94% vertical (endless up-down shaft).
  unstick(vx, vy) {
    const speed = Math.hypot(vx, vy) || 1;
    const minVy = speed * 0.18, minVx = speed * 0.06;
    if (Math.abs(vy) < minVy) {
      const sy = vy === 0 ? -1 : Math.sign(vy);
      vy = sy * minVy;
      vx = Math.sign(vx || 1) * Math.sqrt(Math.max(0, speed * speed - vy * vy));
    } else if (Math.abs(vx) < minVx) {
      const sx = vx === 0 ? 1 : Math.sign(vx);
      vx = sx * minVx;
      vy = Math.sign(vy || -1) * Math.sqrt(Math.max(0, speed * speed - vx * vx));
    }
    return { vx, vy };
  },

  // Rescale a velocity to a new speed, keeping direction.
  atSpeed(vx, vy, speed) {
    const cur = Math.hypot(vx, vy) || 1;
    return { vx: vx / cur * speed, vy: vy / cur * speed };
  },

  // Circle vs axis-aligned rect. Returns null on miss, else the collision
  // normal (axis of least penetration) so the caller can reflect + push out.
  circleRect(cx, cy, r, rx, ry, rw, rh) {
    const px = this.clamp(cx, rx, rx + rw);
    const py = this.clamp(cy, ry, ry + rh);
    const dx = cx - px, dy = cy - py;
    if (dx * dx + dy * dy > r * r) return null;
    if (dx === 0 && dy === 0) {
      // centre inside the rect: pick the nearest face
      const left = cx - rx, right = rx + rw - cx, top = cy - ry, bot = ry + rh - cy;
      const m = Math.min(left, right, top, bot);
      if (m === left)  return { nx: -1, ny: 0, depth: r + left };
      if (m === right) return { nx: 1,  ny: 0, depth: r + right };
      if (m === top)   return { nx: 0, ny: -1, depth: r + top };
      return { nx: 0, ny: 1, depth: r + bot };
    }
    const d = Math.hypot(dx, dy);
    return { nx: dx / d, ny: dy / d, depth: r - d };
  },

  // Reflect velocity about a collision normal (only if moving into it).
  reflect(vx, vy, nx, ny) {
    const dot = vx * nx + vy * ny;
    if (dot >= 0) return { vx, vy, bounced: false };
    return { vx: vx - 2 * dot * nx, vy: vy - 2 * dot * ny, bounced: true };
  },
};

if (typeof window === "undefined") { globalThis.Physics = Physics; }

// Brick Breaker DX service worker.
// Strategy: network-first with cache fallback. Online players always get the
// newest deploy; offline players get the last version they loaded. Firestore
// sync degrades gracefully offline because storage.js falls back to localStorage.

const CACHE = "brickbreaker-v2";

// App shell precached at install so the game works offline from the first visit.
const SHELL = [
  "./",
  "index.html",
  "manifest.json",
  "css/style.css",
  "lib/gk-base.css",
  "lib/gk-util.js",
  "lib/gk-audio.js",
  "lib/gk-ui.js",
  "lib/gk-storage.js",
  "lib/gk-profiles.js",
  "lib/gk-pwa.js",
  "js/firebase-config.js",
  "js/bricks.js",
  "js/powerups.js",
  "js/levels.js",
  "js/upgrades.js",
  "js/physics.js",
  "js/fx.js",
  "js/storage.js",
  "js/game.js",
  "js/bosses.js",
  "js/audio.js",
  "js/main.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only same-origin GETs. Cross-origin requests (Google Fonts, Firebase SDK,
  // Firestore traffic) pass through untouched.
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(
          (hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error())
        )
      )
  );
});

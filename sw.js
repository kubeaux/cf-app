const CACHE = "la-truculance-v7";
const COQUILLE = [
  "./", "index.html", "style.css", "script.js", "envoi.js", "identite.js", "installer.js", "demarrage.js", "extraction.js", "config.js",
  "favicon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png",
  "fonts/instrument-serif-latin-400-normal.woff2",
  "fonts/instrument-serif-latin-400-italic.woff2",
  "fonts/geist-latin-wght-normal.woff2"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(COQUILLE)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      // Tous tes sites GitHub Pages partagent la même origine : on ne supprime que nos propres anciens caches.
      .then((cles) => Promise.all(cles.filter((c) => c.startsWith("la-truculance-") && c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  // Réseau d'abord pour que les mises à jour arrivent tout de suite ; cache si hors-ligne.
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      fetch(e.request)
        .then((r) => {
          // Les réponses partielles (206, lecture de PDF) ne se mettent pas en cache.
          if (r.ok && r.status === 200) cache.put(e.request, r.clone());
          return r;
        })
        .catch(() => cache.match(e.request).then((enCache) => enCache || Response.error()))
    )
  );
});

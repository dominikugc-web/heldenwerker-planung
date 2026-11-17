// App-Dateien auf dem Gerät, damit die App ohne Netz startet. Immer zuerst aus dem Netz (neueste Fassung),
// ohne Netz aus dem Speicher. Server-Anfragen (/api/) laufen nie hierüber.
const SPEICHER = "planung-app";
const DATEIEN = ["./", "index.html", "style.css", "app.js", "api.js", "ui.js", "chat.js", "pruefung.js", "zeichnen.js", "ausgang.js", "lokal.js", "icon.svg", "manifest.webmanifest", "demo-daten.json"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(SPEICHER).then((c) => c.addAll(DATEIEN))); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.includes("/api/")) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const kopie = r.clone(); caches.open(SPEICHER).then((c) => c.put(e.request, kopie)); }
    return r;
  }).catch(async () => (await caches.match(e.request, { ignoreSearch: true })) || caches.match("index.html")));
});

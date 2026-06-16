const CACHE = "budget-tracker-v18";

const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.json",
  "./icon.svg",
  "./modules/state.js",
  "./modules/storage.js",
  "./modules/formatters.js",
  "./modules/queries.js",
  "./modules/import-export.js",
  "./modules/dashboard-page.js",
  "./modules/cutoff-page.js",
  "./modules/category-page.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

// Network-first for HTML/JS/CSS; cache-first for other assets (fonts, images)
self.addEventListener("fetch", (event) => {
  if (!event.request.url.startsWith(self.location.origin)) return;
  const url = event.request.url;
  const isCodeFile = url.endsWith("/") || /\.(html|js|css)(\?|$)/.test(url);
  if (isCodeFile) {
    event.respondWith(
      fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, clone));
        return res;
      }).catch(() => caches.match(event.request))
    );
  } else {
    event.respondWith(
      caches.match(event.request).then((cached) => cached ?? fetch(event.request))
    );
  }
});
  if (isHTML) {
    event.respondWith(
      fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, clone));
        return res;
      }).catch(() => caches.match(event.request))
    );
  } else {
    event.respondWith(
      caches.match(event.request).then((cached) => cached ?? fetch(event.request))
    );
  }
});

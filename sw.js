const CACHE_NAME = "ncore-field-estimate-pwa-v15";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./PretendardVariable.woff2",
  "./icon-192.png",
  "./icon-512.png",
  "./ncore-dark-logo-v7.png",
  "./ncore-watermark-v7.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const requestUrl = new URL(event.request.url);
          if (requestUrl.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached || new Response("오프라인 상태입니다. 인터넷 연결 후 다시 시도해 주세요.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        }));
    })
  );
});

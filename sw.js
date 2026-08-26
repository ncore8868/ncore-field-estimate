/* =========================================================================
   N-CORE 서비스워커 v52

   v51 대비 달라진 점
   - 추가견적 작성과 서명 현황 화면이 들어가 캐시를 갱신합니다.
   ========================================================================= */

const CACHE_NAME = "ncore-field-estimate-pwa-v52";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./safety.html",
  "./sign.html",
  "./manifest.webmanifest",
  "./PretendardVariable.woff2",
  "./icon-192-v2.png",
  "./icon-512-v2.png",
  "./ncore-logo-v8.png",
  "./ncore-watermark-v8.png",
  "./ncore-logo.png",
  "./ncore-doc.js",
  "./ncore-estimate-v2.js",
  "./ncore-stamp.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        Promise.all(CORE_ASSETS.map((url) => cache.add(url).catch(() => null)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* 자주 고치는 파일은 네트워크 우선, 실패하면 캐시로 넘어갑니다. */
async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }
    return response;
  } catch (err) {
    const cached =
      (await caches.match(request, { ignoreSearch: true })) ||
      (await caches.match("./index.html"));

    if (cached) return cached;

    return new Response(
      "오프라인 상태입니다.\n인터넷 연결 후 다시 시도해 주세요.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Apps Script 등 외부 도메인은 서비스워커가 건드리지 않습니다.
  if (url.origin !== self.location.origin) return;

  // HTML 과 스크립트는 항상 최신 우선
  if (
    request.mode === "navigate" ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/safety.html") ||
    url.pathname.endsWith("/sign.html") ||
    url.pathname.endsWith("/ncore-doc.js") ||
    url.pathname.endsWith("/ncore-estimate-v2.js")
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 로고 · 도장 · 폰트 · 아이콘은 캐시 우선
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

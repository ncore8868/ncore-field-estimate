/* =========================================================================
   N-CORE 서비스워커 v57

   v56 대비 달라진 점  (2026-08-29 · 속도)

   ★ 앱을 열 때마다 495KB 를 통째로 다시 내려받고 있었습니다.
     index.html 413KB + ncore-estimate-v2.js 51KB + ncore-doc.js 32KB.
     현장 태블릿에서 앱이 늦게 뜨던 가장 큰 이유가 이것이었습니다.

     원인은 fetch 의 cache:"no-store" 였습니다.
       no-store  = "저장하지 말고 매번 통째로 다시 받아라"
       no-cache  = "쓰기 전에 서버에 물어보고, 바뀌었을 때만 다시 받아라"

     no-cache 로 바꾸면 서버는 안 바뀐 파일에 대해
     '그대로다(304)' 한 줄만 보냅니다 — 수백 바이트입니다.

     ▶ '항상 최신인지 서버에 확인한다' 는 규칙은 하나도 달라지지 않았습니다.
       달라진 것은 **안 바뀐 날에 495KB 를 안 받는다**는 것뿐입니다.
       화면을 새로 올리면 서버가 새 파일을 보내므로 예전과 똑같이 바로 반영됩니다.

   ★ 통신이 느릴 때 앱이 아예 안 열리던 것도 고쳤습니다.
     예전에는 fetch 가 끝날 때까지 무한정 기다렸습니다.
     이제 캐시에 화면이 있으면 2.5초까지만 기다리고 캐시를 먼저 띄웁니다.
     (그 사이에도 받아오던 것은 계속 받아서 캐시를 갱신합니다)

   ★ 캐시 칸 이름에서 물음표 뒤를 떼어냅니다.
     safety.html?staff=홍길동 처럼 주소가 매번 달라지면
     같은 파일이 사람 수만큼 따로 쌓입니다.
   ========================================================================= */

const CACHE_NAME = "ncore-field-estimate-pwa-v62";

/* 캐시가 있을 때 네트워크를 기다려주는 시간 */
const NET_WAIT_MS = 2500;

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

/* 물음표 뒤(?staff=... 같은 것)를 떼어낸 주소.
   같은 파일이 여러 칸에 쌓이지 않게 합니다. */
function cacheKey(request) {
  const url = new URL(request.url);
  return url.origin + url.pathname;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

/* 받아온 것을 캐시에 넣습니다. 실패해도 화면에는 영향이 없습니다. */
function keep(cache, request, response) {
  if (!response || !response.ok || response.redirected) return;
  try {
    cache.put(cacheKey(request), response.clone()).catch(() => {});
  } catch (err) { /* 넣지 못해도 그냥 넘어갑니다 */ }
}

/* 화면 파일 — 항상 서버에 최신인지 물어보되,
   캐시가 있으면 오래 기다리지 않습니다. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(cacheKey(request), { ignoreSearch: true });

  const fromNet = fetch(request, { cache: "no-cache" })
    .then((response) => {
      keep(cache, request, response);
      return response && response.ok ? response : null;
    })
    .catch(() => null);

  /* 캐시가 있을 때만 시간을 끊습니다.
     캐시가 없으면(처음 설치) 끝까지 기다려야 화면이 나옵니다. */
  const fresh = cached
    ? await Promise.race([fromNet, wait(NET_WAIT_MS)])
    : await fromNet;

  if (fresh) return fresh;
  if (cached) return cached;

  const fallback = await caches.match("./index.html", { ignoreSearch: true });
  if (fallback) return fallback;

  return new Response(
    "오프라인 상태입니다.\n인터넷 연결 후 다시 시도해 주세요.",
    { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
  );
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
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(cacheKey(request), { ignoreSearch: true }).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            keep(cache, request, response);
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});

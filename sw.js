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

const CACHE_NAME = "ncore-field-estimate-pwa-v68";

/* ★★ 글꼴과 그림은 **따로 담습니다** (2026-09-02).
   글꼴 하나가 1.24MB 인데, 화면을 한 글자만 고쳐도 위의 판 번호가 올라가고
   그러면 예전 칸을 통째로 지우느라 **글꼴을 다시 받았습니다.**
   지금까지 66번 올렸으니 태블릿마다 80MB 를 헛되이 받은 셈입니다.
   현장에서 LTE 로 여는 앱이라 이 시간이 그대로 고객 앞에서 흘러갑니다.

   이 칸은 판 번호를 올려도 지우지 않습니다.
   ★ 그림·글꼴을 진짜로 바꿀 때는 **파일 이름에 판을 붙이세요**
     (`ncore-logo-v8.png` → `ncore-logo-v9.png`). 아래 목록만 고치면
     이름이 빠진 옛 파일은 저절로 지워집니다. */
const ASSET_CACHE = "ncore-field-estimate-assets-v1";

const ASSETS = [
  "./PretendardVariable.woff2",
  "./icon-192-v2.png",
  "./icon-512-v2.png",
  "./ncore-logo-v8.png",
  "./ncore-watermark-v8.png",
  "./ncore-stamp.png"
];

/** 이 주소가 '따로 담는 것' 인가 */
function isAsset(pathname) {
  for (let i = 0; i < ASSETS.length; i++) {
    if (pathname.endsWith(ASSETS[i].replace("./", "/"))) return true;
  }
  return false;
}

/* 캐시가 있을 때 네트워크를 기다려주는 시간 */
const NET_WAIT_MS = 2500;

/* 화면 파일 — 고칠 때마다 새로 받아야 하는 것 */
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./safety.html",
  "./sign.html",
  "./manifest.webmanifest",
  "./ncore-doc.js",
  "./ncore-estimate-v2.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) =>
        Promise.all(CORE_ASSETS.map((url) => cache.add(url).catch(() => null)))
      ),
      /* ★ 이미 담겨 있으면 다시 받지 않습니다 */
      caches.open(ASSET_CACHE).then((cache) =>
        Promise.all(ASSETS.map((url) =>
          cache.match(url, { ignoreSearch: true })
            .then((있음) => (있음 ? null : cache.add(url).catch(() => null)))
        ))
      )
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      /* 옛 판의 화면 칸만 지웁니다 — 글꼴 칸은 남겨 둡니다 */
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== ASSET_CACHE)
            .map((key) => caches.delete(key))
        )
      ),
      /* 목록에서 빠진 옛 그림은 치웁니다 (이름에 판이 붙어 있으므로) */
      caches.open(ASSET_CACHE).then((cache) =>
        cache.keys().then((reqs) =>
          Promise.all(reqs.map((r) =>
            isAsset(new URL(r.url).pathname) ? null : cache.delete(r)
          ))
        )
      ).catch(() => null)
    ]).then(() => self.clients.claim())
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

  /* 로고 · 도장 · 글꼴 · 아이콘은 캐시 우선.
     ★ 담아 두는 칸이 화면 칸과 다릅니다 (판을 올려도 안 지워집니다) */
  const 칸 = isAsset(url.pathname) ? ASSET_CACHE : CACHE_NAME;
  event.respondWith(
    caches.open(칸).then((cache) =>
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

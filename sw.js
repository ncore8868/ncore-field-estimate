/* =========================================================================
   N-CORE 서비스워커 v45

   v43 대비 달라진 점
   - index.html 을 내려줄 때 </body> 앞에
     <script src="./ncore-estimate-v2.js"></script> 를 자동으로 끼워 넣습니다.
     index.html 을 직접 고칠 필요가 없어집니다.
   - ncore-estimate-v2.js 는 항상 최신 파일을 먼저 가져옵니다.
     앞으로 그 파일만 덮어쓰면 캐시 버전을 올리지 않아도 바로 반영됩니다.
   - 도장 파일(ncore-stamp.png)을 캐시 목록에 넣었습니다.
   ========================================================================= */

const CACHE_NAME = "ncore-field-estimate-pwa-v45";
const ADDON_SRC = "./ncore-estimate-v2.js";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./safety.html",
  "./manifest.webmanifest",
  "./PretendardVariable.woff2",
  "./icon-192-v2.png",
  "./icon-512-v2.png",
  "./ncore-dark-logo-v7.png",
  "./ncore-watermark-v7.png",
  "./ncore-logo.png",
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

/* index.html 인지 판단합니다. safety.html 에는 넣지 않습니다. */
function isMainPage(url, request) {
  if (url.pathname.endsWith("/safety.html")) return false;
  if (url.pathname.endsWith("/index.html")) return true;
  if (url.pathname.endsWith("/")) return true;
  return request.mode === "navigate";
}

/* HTML 안에 애드온 스크립트를 끼워 넣습니다.
   이미 들어 있으면 그대로 둡니다. */
function injectAddon(html) {
  if (html.indexOf("ncore-estimate-v2.js") !== -1) return html;

  const tag =
    "\n  <!-- sw v45 자동 주입: 견적서 v2 서식 + 전자서명 -->\n" +
    '  <script src="' + ADDON_SRC + '"></script>\n';

  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, tag + "</body>");
  if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, tag + "</html>");
  return html + tag;
}

async function handleMainPage(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (!response || !response.ok) throw new Error("network");

    const type = response.headers.get("content-type") || "";
    if (type.indexOf("text/html") === -1) return response;

    const html = injectAddon(await response.text());

    const out = new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });

    // 오프라인에서도 주입된 상태로 열리도록 그대로 저장합니다.
    caches.open(CACHE_NAME).then((cache) => cache.put(request, out.clone()));
    return out;
  } catch (err) {
    const cached =
      (await caches.match(request, { ignoreSearch: true })) ||
      (await caches.match("./index.html"));

    if (cached) {
      const type = cached.headers.get("content-type") || "";
      if (type.indexOf("text/html") !== -1) {
        const html = injectAddon(await cached.text());
        return new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      }
      return cached;
    }

    return new Response(
      "오프라인 상태입니다.\n인터넷 연결 후 다시 시도해 주세요.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
}

async function handleAlwaysFresh(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Apps Script 등 외부 도메인은 건드리지 않습니다.
  if (url.origin !== self.location.origin) return;

  // 1) 메인 페이지: 최신 파일을 받아 스크립트를 끼워 넣어 내려줍니다.
  if (isMainPage(url, request)) {
    event.respondWith(handleMainPage(request));
    return;
  }

  // 2) 자주 고치는 파일: 항상 최신 우선
  if (
    url.pathname.endsWith("/ncore-estimate-v2.js") ||
    url.pathname.endsWith("/safety.html")
  ) {
    event.respondWith(handleAlwaysFresh(request));
    return;
  }

  // 3) 로고 · 도장 · 폰트 · 아이콘: 캐시 우선
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

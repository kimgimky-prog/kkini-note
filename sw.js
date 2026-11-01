// =====================================================================
// sw.js : 서비스 워커 (앱 파일을 폰에 보관해서 인터넷 없이도 열리게 해줘요)
// ---------------------------------------------------------------------
// ▶ 앱 파일(app.js, foods.js 등)을 고친 뒤에는 아래 VERSION 숫자를 하나 올려 주세요.
//   그래야 폰에 보관된 옛날 파일 대신 새 파일을 받아요.
// =====================================================================
const VERSION = "kkini-v5";
const FILES = [
  "./", "index.html", "style.css", "foods.js", "nutrition.js", "app.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];

// 설치될 때: 앱 파일을 전부 보관함(cache)에 넣어요
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

// 새 버전이 켜질 때: 옛날 보관함은 지워요
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 파일을 달라고 할 때: 인터넷이 되면 새 파일을 받아 보관함도 갱신하고,
// 인터넷이 안 되면 보관함에 있는 파일을 줘요 (글꼴도 같이 보관)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("index.html")))
  );
});

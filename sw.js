// =====================================================================
//  서비스 워커 — 휴대폰에 "앱으로 설치"할 수 있게 해주는 파일
//  - 화면 파일(HTML, 아이콘)만 저장해둬요. 인터넷이 잠깐 끊겨도 화면은 열려요.
//  - AI 대화(/api, Gemini)는 항상 인터넷이 필요해서 저장하지 않아요.
//  - 앱을 수정했는데 휴대폰에 안 바뀌면 아래 VERSION 숫자를 올려주세요.
// =====================================================================
const VERSION = "opic-v6";
const SHELL = ["/", "/manifest.json", "/script-parser.js", "/default-script.txt", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // 다른 사이트(Gemini 등), /api, GET이 아닌 요청은 건드리지 않음
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  // 인터넷 먼저 → 실패하면 저장된 것 사용 (그래서 앱 수정이 바로 반영돼요)
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
  );
});

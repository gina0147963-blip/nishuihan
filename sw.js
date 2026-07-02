// ============================================================
// SERVICE WORKER — 離線快取與 PWA 安裝支援
// ============================================================
const CACHE_NAME = 'nshuanguild-v4';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/data.js',
  './js/store.js',
  './js/app.js',
  './js/helpers.js',
  './js/player.js',
  './js/lineup.js',
  './js/members.js',
  './js/matches.js',
  './js/stats.js',
  './js/signup.js',
  './js/skills.js',
  './js/gsync.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
];

// 安裝階段：預先快取核心檔案
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        CORE_ASSETS.map((url) => cache.add(url).catch((err) => {
          console.warn('快取失敗（略過）:', url, err.message);
        }))
      );
    })
  );
});

// 啟用階段：清除舊版本快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// 攔截請求：
// - 對於應用程式自己的檔案（HTML/CSS/JS），採用「快取優先，背景更新」策略，確保離線可用
// - 對於 Google Apps Script 同步請求，一律走網路（不快取，因為是即時資料寫入/讀取）
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 不快取 Google Apps Script 請求（同步用，必須即時）
  if (url.includes('script.google.com')) {
    event.respondWith(fetch(event.request).catch(() => {
      return new Response(JSON.stringify({ error: 'offline' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }));
    return;
  }

  // 只處理 GET 請求
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // 背景更新快取
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cached); // 離線時退回快取

      return cached || fetchPromise;
    })
  );
});

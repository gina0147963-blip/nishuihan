// ============================================================
// SERVICE WORKER — 離線快取與 PWA 安裝支援
// ============================================================
const CACHE_NAME = 'nshuanguild-v109';
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
  './js/scores.js',
  './js/gsync.js',
  './js/qr.js',
  './icons/icon-192.png',
  './icons/jobs/jiuling.png',
  './icons/jobs/longyin.png',
  './icons/jobs/shenxiang.png',
  './icons/jobs/suwen.png',
  './icons/jobs/suimeng.png',
  './icons/jobs/tieyi.png',
  './icons/jobs/xehe.png',
  './icons/jobs/xuanji.png',
  './icons/jobs/chaoguang.png',

  './icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
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
// - 應用程式自己的 HTML/CSS/JS 採「網路優先」：每次先抓最新版，抓不到（離線）才用快取。
//   這能確保你一更新檔案，所有裝置立刻拿到新版，不會再被舊快取卡住而看到過時/壞掉的程式。
// - 圖片等靜態資源仍走「快取優先」以求速度。
// - Google Apps Script 同步請求一律走網路（即時資料，不快取）。
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

  // 判斷是否為「程式碼類」檔案（HTML / JS / CSS）→ 網路優先
  const isCode = /\.(html?|js|css)(\?|$)/i.test(url) || url.endsWith('/') || event.request.mode === 'navigate';

  if (isCode) {
    // 網路優先：先抓最新，成功就更新快取並回傳；失敗（離線）才退回快取
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 其他（圖片、字型等）：快取優先，背景更新
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

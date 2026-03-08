const CACHE_NAME = 'oshitag-0.2.7-0';

const ASSETS = [
  './',
  './index.html',
  './assets/css/styles.css',
  './assets/js/app.js',
  './manifest.json',
  './i18n/zh-CN.json',
  './i18n/en.json',
  './i18n/ja.json',
  './i18n/ko.json',
  './assets/icons/icon.svg',
  './assets/icons/maskable.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(ASSETS);
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k))));
      self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
  if (!isHttp) return;

  const isSameOrigin = url.origin === self.location.origin;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          if (res && res.ok && res.type === 'basic') cache.put('./index.html', res.clone());
          return res;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const fallback = await cache.match('./index.html');
          return fallback || new Response('离线且无缓存', { status: 503 });
        }
      })()
    );
    return;
  }

  if (!isSameOrigin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === 'basic') {
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        return new Response('离线且无缓存', { status: 503 });
      }
    })()
  );
});

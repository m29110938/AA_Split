self.addEventListener('install', e => {
  e.waitUntil(
    caches.open('aa-split-cache').then(cache => {
      return cache.addAll([
        '/',
        '/index.html',
        '/app.js',
        '/style.css',
        '/manifest.json'
      ]);
    })
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});

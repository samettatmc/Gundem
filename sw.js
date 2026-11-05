// Gündem service worker: uygulamayı internetsiz de açılabilir yapar.
// Strateji: önce internetten en güncel dosyayı dene, olmazsa kayıtlı kopyayı kullan.
// Böylece yeni bir sürüm yüklendiğinde bir sonraki açılışta kendiliğinden gelir.
const CACHE = 'gundem-v6';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'build-info.js', 'vendor/supabase.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase isteklerine karışma
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});

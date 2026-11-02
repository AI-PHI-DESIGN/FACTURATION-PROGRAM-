/*
 * Service worker: permite instalar la app y usarla sin internet.
 * - La página (index.html) se pide primero a internet (para coger las versiones nuevas) y,
 *   si no hay conexión o tarda más de 4 s, se usa la copia guardada.
 * - El resto de archivos se sirven de la copia guardada y se actualizan en segundo plano.
 * Al publicar cambios en los archivos, sube VERSION para limpiar la caché antigua.
 */
const VERSION = 'facturacion-v5';
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.json',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './iconos/icono-maskable-512.png',
  './iconos/apple-touch-icon.png',
  './iconos/icono.svg',
  './vendor/jspdf.umd.min.js',
  './vendor/html2canvas.min.js',
  './vendor/anthropic-sdk.mjs',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function conLimite(promesa, ms) {
  return new Promise((ok, mal) => {
    const t = setTimeout(() => mal(new Error('tiempo agotado')), ms);
    promesa.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); mal(e); });
  });
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    ev.respondWith(
      conLimite(fetch(req), 4000)
        .then((resp) => {
          if (resp.ok) {
            const copia = resp.clone();
            caches.open(VERSION).then((c) => c.put('./index.html', copia));
          }
          return resp;
        })
        .catch(() => caches.match('./index.html').then((r) => r || fetch(req)))
    );
    return;
  }

  ev.respondWith(
    caches.match(req, { ignoreSearch: true }).then((guardada) => {
      const deRed = fetch(req)
        .then((resp) => {
          if (resp.ok) {
            const copia = resp.clone();
            caches.open(VERSION).then((c) => c.put(req, copia));
          }
          return resp;
        })
        .catch(() => guardada);
      return guardada || deRed;
    })
  );
});

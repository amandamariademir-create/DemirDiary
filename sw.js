'use strict';

// Höj versionen när filerna ändras så att gamla cachen rensas.
const CACHE = 'demirdiary-v6';
const FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './common.js',
  './analys.html',
  './analys.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Försök hämta från nätet först så att uppdateringar syns direkt.
// "no-cache" gör att webbläsaren alltid frågar servern om filen har ändrats,
// i stället för att använda en gammal kopia ur sin egen cache. Annars kan en
// gammal sida blandas med ny kod. Utan internet används den sparade kopian.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request, { ignoreSearch: true }).then(
          (cached) => cached || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error())
        )
      )
  );
});

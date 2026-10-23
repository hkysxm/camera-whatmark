// Bump VERSION when changing the PWA assets or cache strategy.
const VERSION = 'v1';
// Scope-specific names avoid touching caches belonging to other GitHub Pages apps.
const PREFIX = `optimark:${self.registration.scope}:`;
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const RESOURCE_CACHE = `${PREFIX}resources-${VERSION}`;
const appUrl = path => new URL(path, self.registration.scope).href;
const INDEX_URL = appUrl('index.html');
const TAILWIND_URL = 'https://cdn.tailwindcss.com/3.4.17';
const HEIC_URL = 'https://cdn.jsdelivr.net/npm/heic-to@1.6.6/dist/iife/heic-to.js';
const SHELL = ['index.html', 'manifest.webmanifest', 'pwa.js', 'icons/icon-192.png',
  'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'].map(appUrl);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' })));
    // The editor's existing CDN script must also be available on first offline launch.
    const response = await fetch(new Request(TAILWIND_URL, { mode: 'no-cors', cache: 'reload' }));
    if (!response.ok && response.type !== 'opaque') throw new Error('Styles unavailable');
    await (await caches.open(RESOURCE_CACHE)).put(TAILWIND_URL, response);
    // Do not skipWaiting: an update must not interrupt an open editing session.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) &&
      name !== SHELL_CACHE && name !== RESOURCE_CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function openEditor(request) {
  const cache = await caches.open(SHELL_CACHE);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(request, { cache: 'no-cache', signal: controller.signal });
    if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
      await cache.put(INDEX_URL, response.clone()).catch(() => {});
      return response;
    }
    return (await cache.match(INDEX_URL)) || response;
  } catch (error) {
    const cached = await cache.match(INDEX_URL);
    if (cached) return cached;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function cachedResource(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // A full cache must not prevent a successfully fetched dependency from loading.
  if (response.ok || response.type === 'opaque') await cache.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate' &&
      (url.href.split('?')[0] === self.registration.scope ||
       (url.origin + url.pathname) === INDEX_URL)) {
    event.respondWith(openEditor(request));
    return;
  }
  if (SHELL.includes(url.href) && url.href !== INDEX_URL) {
    event.respondWith(cachedResource(request, SHELL_CACHE));
    return;
  }
  // Only application dependencies are cached; imported photos and exports are never stored here.
  if (url.href === TAILWIND_URL || url.href === HEIC_URL ||
      url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cachedResource(request, RESOURCE_CACHE));
  }
});

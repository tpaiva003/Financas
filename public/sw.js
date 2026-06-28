/**
 * Service worker mínimo para a PWA.
 *
 * Estratégia conservadora:
 *  - Navegações (HTML): network-first com fallback à cache (offline básico).
 *  - Pedidos GET de ativos do próprio domínio: stale-while-revalidate.
 *  - Nunca cacheia rotas de API/auth nem pedidos não-GET.
 *
 * A fila offline de criação de despesas (REQ-SYNC-2) é Fase 2.
 */

const CACHE = "financas-v1";
const APP_SHELL = ["/dashboard", "/manifest.webmanifest", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/dashboard"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

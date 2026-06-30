/**
 * Service worker mínimo para a PWA.
 *
 * REGRA DE OURO: nunca servir conteúdo dinâmico em cache (o saldo e as despesas
 * têm de estar sempre frescos). Só ativos imutáveis são cacheados.
 *  - /_next/static e /icons: cache-first (immutable).
 *  - Navegações (HTML): network-first, com fallback offline ao shell.
 *  - Tudo o resto (incl. pedidos RSC de navegação no cliente, /api): passa
 *    direto à rede, sem cache. Evita listas/saldos desatualizados.
 *
 * A fila offline de criação de despesas (REQ-SYNC-2) é Fase 2.
 */

const CACHE = "financas-v2";
const PRECACHE = ["/icons/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Ativos imutáveis: cache-first (rápido e seguro de cachear).
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
          return res;
        });
      }),
    );
    return;
  }

  // Navegações (HTML): network-first; offline → shell em cache.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/dashboard").then((r) => r || caches.match("/"))),
    );
    return;
  }

  // Tudo o resto (RSC, dados dinâmicos, API): rede direta, sem cache.
  // (não chamamos respondWith → o browser trata, sempre fresco)
});

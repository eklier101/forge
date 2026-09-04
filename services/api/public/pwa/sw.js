/* Forge PWA service worker — offline shell for the hosted web app. */
const VERSION = "__FORGE_VERSION__";
const SHELL_CACHE = `forge-shell-${VERSION}`;
const ASSET_CACHE = `forge-assets-${VERSION}`;
const SCOPE_PATH = "/app/";
const OFFLINE_URL = "/app/index.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/app/manifest.webmanifest"]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("forge-") && k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Only the exported web bundle is cacheable; API traffic must always hit the server. */
function isAppAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(SCOPE_PATH);
}

async function networkFirstDocument(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put(OFFLINE_URL, fresh.clone());
    return fresh;
  } catch {
    const cached = (await caches.match(request)) ?? (await caches.match(OFFLINE_URL));
    if (cached) return cached;
    return new Response("Forge is offline and has no cached copy yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) {
    void network;
    return cached;
  }
  const fresh = await network;
  if (fresh) return fresh;
  throw new Error("offline");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate" && isAppAsset(url)) {
    event.respondWith(networkFirstDocument(request));
    return;
  }
  if (isAppAsset(url)) {
    event.respondWith(
      staleWhileRevalidate(request).catch(
        () => new Response("", { status: 504, statusText: "Offline" }),
      ),
    );
  }
});

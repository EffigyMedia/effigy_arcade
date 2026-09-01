/* =====================================================================
   EFFIGY ARCADE — sw.js

   Two jobs, and they pull in opposite directions:

     · never serve a stale file when the network is there
     · always serve something when it is not

   So pages and scripts are network-first with a short timeout and a cache
   fallback, while art and fonts are served from cache immediately and
   refreshed in the background. There is no version number to maintain —
   freshness comes from asking the network first, not from a cache name.

   Games are cached the first time you open them, so a machine you have
   never played is the one thing that will not work on a plane.

   © 2026 Effigy Media. All rights reserved.
   ===================================================================== */
/* BUMP THESE WHENEVER A FILE MOVES OR IS RENAMED. A device that already has
   the old catalogue cached will keep serving it, and every path in it now
   points at a file that no longer exists — which is a site of 404s that looks
   like a broken deploy rather than a stale cache. Changing the names makes
   every client throw its cache away on the next visit. */
/* v20: v19 shipped with an EMPTY asset list. Any device that installed it is
   holding a worker that caches no cabinets, and it will keep serving that
   worker until the name changes. */
/* v27: eight versions shipped in one evening - the beam rebuilt, the count-in,
   the biome moved onto distance - and the cache names were not touched once.
   The owner got the exact symptom the note below predicts: a black screen with
   the mirror still drawing, which is the previous game HTML running beside the
   current shared scripts. Nothing MOVED or was renamed, which is what the rule
   above asks about, and that turned out to be the wrong question: what matters
   is whether the files still agree with each other, and after a change the size
   of road.js they do not. */
/* v28: the weather in the rear-view. road.js changed and no cabinet HTML did, so a stale half
   would be the old feature rather than the black screen v27 describes - but this build exists to
   be JUDGED ON A DEVICE, and a device serving a cached arcade.js reports the version it has
   rather than the version it was sent. Testing 0.10.16 while believing it is 0.10.17 is the
   failure this project has already had, at a cost of forty-six commits. */
const CORE    = 'effigy-arcade-core-v45';
/* ---- ONE VERSION, NOT TWO ----------------------------------------------
   CORE went to v20 and RUNTIME stayed at v19, so a device kept a runtime cache
   from the broken build alongside a fresh core. They are bumped together from
   here: two names, one version number, so a stale half can never survive an
   update.
   ---------------------------------------------------------------------- */
const RUNTIME = 'effigy-arcade-runtime-v45';
/* ---- HARD EVICTION -----------------------------------------------------
   A half-updated cache is worse than no cache: a device holding the previous
   game HTML beside the current shared scripts gets a black screen, because the
   two no longer agree. Any cache whose name is not in KEEP is deleted on
   activate, so a version bump can never leave a mixture behind.
   ------------------------------------------------------------------------ */
const KEEP    = [CORE, RUNTIME];

/* The shell. Enough to open the arcade with no signal at all. */
const CORE_FILES = [
  './',
  './index.html',
  './audio.js',
  './arcade.js',
  './road.js',
  './games.js',
  /* assets.js was in NO list at all — not here, not ALL_FILES, not its own
     manifest — and it loads before the worker controls a first visit, so it
     was the one file that never reached any cache. Offline it 404ed, the
     loader saw an empty manifest and said READY anyway. */
  './assets.js',
  './manifest.webmanifest',
  './icon.png',
  './icon-512.png',
  './effigy.png'
];

/* ---------------------------------------------------------------------------
   EVERYTHING ELSE — every cabinet and every font, written here by pack.sh.
   This used to be lazy: a game was cached the first time you opened it, so a
   machine you had never played was a 404 offline, and a partially-warmed cache
   produced intermittent misses that looked like a broken deploy. The whole
   arcade is now pulled down on first visit.
   DO NOT EDIT BY HAND — pack.sh regenerates it from what is actually shipping,
   so it cannot drift out of step with the catalogue.
   --------------------------------------------------------------------------- */
const ALL_FILES = [
  "./games/em/hardpoint.html",
  "./games/em/quietus.html",
  "./games/sw/interstate.html",
  "./games/sw/motorsport.html",
  "./fonts/archivo-var.woff2",
  "./fonts/bricolagegrotesque-var.woff2",
  "./fonts/dmmono-400.woff2",
  "./fonts/dmmono-500.woff2",
  "./fonts/ibmplexmono-400.woff2",
  "./fonts/ibmplexmono-500.woff2",
  "./fonts/ibmplexmono-600.woff2",
  "./fonts/orbitron-var.woff2",
  "./fonts/pressstart2p-400.woff2",
  "./fonts/sairacondensed-600.woff2",
  "./fonts/sairacondensed-800.woff2",
  "./fonts/sharetechmono-400.woff2",
  "./fonts/vt323-400.woff2"
];

const NET_TIMEOUT = 7000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE);
    /* one at a time: a single 404 must not sink the whole install */
    await Promise.all(CORE_FILES.map(f =>
      cache.add(new Request(f, { cache: 'reload' })).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

/* ---------------------------------------------------------------------------
   There is deliberately NO precache machinery in here any more. Filling the
   cache is done by the PAGE (the loading panel in index.html writes straight
   into CACHE_NAME with the Cache API — no worker, no handshake) and by the
   FETCH ALL button (which messages `prefetch`, handled below). A third path
   lived here — fillCache, answering a {type:'precache'} message — and NOTHING
   SENT THAT MESSAGE: the sender was removed when the page took over, the
   handler stayed, and its comment went on describing a protocol that no
   longer existed. Dead code that documents itself as load-bearing is worse
   than no code; it is gone.
   --------------------------------------------------------------------------- */

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map(n => KEEP.includes(n) ? null : caches.delete(n)));
    await self.clients.claim();
  })());
});

/* The browser keeps its own HTTP cache in front of us, and it will happily
   hand this worker a stale script it decided was still fresh. Ask for a
   reload so the network is really the network — the Cache API below is then
   the only cache in play, which is the whole point of running a worker. */
function freshRequest(request){
  if (request.mode === 'navigate') return request;   // cannot be re-wrapped
  try {
    return new Request(request.url, {
      cache: 'reload',
      mode: request.url.indexOf(self.location.origin) === 0 ? 'same-origin' : 'cors',
      credentials: 'same-origin',
      redirect: 'follow'
    });
  } catch (e) { return request; }
}

function timedFetch(request, ms){
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(freshRequest(request))
      .then(res => { clearTimeout(timer); resolve(res); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

/* pages and code: the network is the source of truth, cache is the parachute */
async function networkFirst(request){
  const cache = await caches.open(RUNTIME);
  /* Look this up BEFORE going to the network, so a bad answer has somewhere
     to fall back to. `caches.match` searches every cache, which matters
     because the precache writes to CORE and this function's own puts go to
     RUNTIME — a file could be perfectly cached and still be missed here. */
  const cached = (await cache.match(request)) || (await caches.match(request));
  try {
    const fresh = await timedFetch(request, NET_TIMEOUT);
    /* THE 404 BUG: a non-ok response was returned straight through. A flaky
       moment, a sleeping host, a redirect gone wrong — any of them produced a
       404 for a file sitting in the cache the whole time. A bad answer is now
       treated exactly like no answer. */
    if (fresh && fresh.ok){
      cache.put(request, fresh.clone()).catch(() => {});
      return fresh;
    }
    if (cached) return cached;
    /* ---- A DEAD LINK SHOULD LAND IN THE LOBBY -------------------------
       A navigation that 404s with nothing cached is a stale link — an old
       catalogue pointing at a renamed cabinet, or a host serving a deploy
       that no longer has the file. The server's 404 page is a dead end on a
       device that has the whole arcade sitting in its cache; the launcher is
       not. Non-navigations still pass the 404 through, because a script tag
       fed index.html would be a far stranger failure than a missing file. */
    if (request.mode === 'navigate'){
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    return fresh;                       /* nothing cached: pass it on as-is */
  } catch (err) {
    if (cached) return cached;
    if (request.mode === 'navigate'){
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

/* art and fonts: instant from cache, quietly refreshed for next time */
async function staleWhileRevalidate(request){
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(request);
  const spin = fetch(request)
    .then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()).catch(() => {}); return res; })
    .catch(() => null);
  if (hit) return hit;
  /* `hit || spin.then(...) || Response.error()` never reached the last arm —
     a pending promise is truthy — so a miss with a dead network resolved to
     NOTHING and respondWith(undefined) failed with a TypeError instead of a
     clean error response */
  const res = (await spin) || (await caches.match(request));
  return res || Response.error();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const sameOrigin = url.origin === self.location.origin;
  const isCode = /\.(?:html|js|webmanifest|json)$/i.test(url.pathname) || req.mode === 'navigate';

  if (sameOrigin && isCode) event.respondWith(networkFirst(req));
  else event.respondWith(staleWhileRevalidate(req));
});

/* The launcher can ask for the whole catalogue up front, so a machine you
   have never opened still works with no signal. Progress is reported back so
   the settings sheet can show it. */
async function fetchAll(urls, client){
  const cache = await caches.open(RUNTIME);
  let done = 0, failed = 0;
  for (const url of urls){
    try {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (res && res.ok) await cache.put(url, res.clone());
      else failed++;
    } catch (e) { failed++; }
    done++;
    if (client) client.postMessage({ type:'prefetch', done, total:urls.length, failed });
  }
  if (client) client.postMessage({ type:'prefetch-done', done, total:urls.length, failed });
}

self.addEventListener('message', event => {
  const data = event.data;
  if (data === 'skipWaiting') return self.skipWaiting();
  if (data === 'purge'){
    event.waitUntil((async () => {
      for (const k of await caches.keys()) await caches.delete(k);
      if (event.source) event.source.postMessage({ type:'purged' });
    })());
    return;
  }
  if (data && data.type === 'prefetch' && Array.isArray(data.urls)){
    event.waitUntil(fetchAll(data.urls, event.source));
  }
});

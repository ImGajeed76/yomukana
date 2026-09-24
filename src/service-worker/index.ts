/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

// Makes yomukana work offline.
//
// The reader's progress already lives in their browser, so the only thing that
// ever needed the network was the app itself and the sentences. With both
// cached, a phone on a train with no signal is a phone that can still
// practise, and sync catches up whenever it next gets through.
//
// Only this site's own files. Neon and Plausible are other origins and are
// left alone: offline they fail the way they always did, and sync already
// treats that as "try again later".

import { build, files, prerendered, version } from "$service-worker";

const worker = self as unknown as ServiceWorkerGlobalScope;

/** The app for this deploy: scripts, styles, pages and small static files. */
const APP_CACHE = `app-${version}`;
/** Sentence chunks, cached as they are first read. */
const CORPUS_CACHE = `corpus-${version}`;
const CORPUS_PATH = "/corpus/";

// The corpus is twelve megabytes across ten bands, and most readers only ever
// open a few of them. So it is not downloaded up front: each band is kept the
// first time it is read, which the app already does a band ahead of need.
const APP_FILES = [
  ...build,
  ...prerendered,
  ...files.filter((file) => !file.startsWith(CORPUS_PATH)),
];

/**
 * The bands every new reader starts on, and the index that lists the rest.
 *
 * On a first visit the page loads these before this worker exists, so they
 * would never pass through it. Kept here instead, so someone who opens the app
 * once and then loses signal still has sentences to read. The browser has
 * usually just downloaded them, so this is mostly a copy from its own cache.
 */
const STARTING_CORPUS = [
  `${CORPUS_PATH}index.json`,
  `${CORPUS_PATH}band-0.json`,
  `${CORPUS_PATH}band-1.json`,
];

worker.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(APP_CACHE).then((cache) => cache.addAll(APP_FILES)),
      caches.open(CORPUS_CACHE).then((cache) => cache.addAll(STARTING_CORPUS)),
    ]),
  );
});

// A new deploy's caches replace the old ones. No skipWaiting: a new worker
// waits until every tab on the old version is closed, because swapping it in
// under an open page would hand that page files from a build it never loaded.
worker.addEventListener("activate", (event) => {
  // Takes over pages that are already open, so the next band this page asks
  // for is cached too, not only what later visits ask for. Safe here where
  // skipWaiting would not be: on a first visit there is no older worker whose
  // page could be handed another build's files.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== APP_CACHE && key !== CORPUS_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => worker.clients.claim()),
  );
});

/** From the cache if it is there, otherwise from the network, keeping a copy. */
async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached !== undefined) return cached;

  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

/**
 * A page: from the network when there is one, so a new deploy shows up, and
 * from the cache when there is not.
 */
async function networkFirst(request: Request): Promise<Response> {
  // Offline, fetch rejects rather than resolving, and that is the whole case
  // this exists for. It cannot be prevented, only answered from the cache.
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(APP_CACHE);
    const url = new URL(request.url);
    const page = (await cache.match(url.pathname)) ?? (await cache.match("/"));
    if (page !== undefined) return page;
    throw error;
  }
}

worker.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== worker.location.origin) return;

  if (url.pathname.startsWith(CORPUS_PATH)) {
    event.respondWith(cacheFirst(request, CORPUS_CACHE));
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  } else if (APP_FILES.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, APP_CACHE));
  }
});

/**
 * Service Worker for offline PWA support.
 * Caches static bundles, self-hosted Pyodide WASM binaries, and sudoku.zip.
 */

const CACHE_NAME = 'sudoku-pwa-v1'

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './py/sudoku.zip',
  './pyodide/pyodide.js',
  './pyodide/pyodide.asm.js',
  './pyodide/pyodide.asm.wasm',
  './pyodide/python_stdlib.zip',
  './pyodide/pyodide-lock.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('Pre-cache error during install:', err))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
        )
      })
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  // Cache-first for Pyodide assets and sudoku.zip, network-first for others
  const url = new URL(event.request.url)
  const isPythonAsset = url.pathname.includes('/pyodide/') || url.pathname.includes('/py/')

  if (isPythonAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
      })
    )
  } else {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.ok && event.request.method === 'GET') {
              const clone = networkResponse.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
            }
            return networkResponse
          })
          .catch(() => cached)

        return cached || fetchPromise
      })
    )
  }
})

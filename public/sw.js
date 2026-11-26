// Service worker: сохраняет страницы и файлы сайта в браузере.
// Если ученик обновит страницу теста без интернета, она откроется из этого хранилища.
const CACHE = "quiz-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Картинки вопросов по своему адресу никогда не меняются — их тоже храним, чтобы тест работал без интернета
  const isImage = url.pathname.startsWith("/api/images/");
  if (url.pathname.startsWith("/api/") && !isImage) return; // остальные данные всегда только с сервера

  // Файлы сборки (JS, CSS, шрифты) не меняются — берём из кэша, если есть
  if (isImage || url.pathname.startsWith("/_next/static/") || /\.(woff2?|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  // Страницы — сначала из интернета (свежие), а без интернета — сохранённая копия
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(url.pathname)) ||
            (await cache.match("/test")) ||
            new Response("Нет интернета", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
          );
        }),
    );
  }
});

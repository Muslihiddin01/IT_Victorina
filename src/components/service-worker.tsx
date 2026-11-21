"use client";

import { useEffect } from "react";

// Service worker сохраняет страницы сайта в браузере.
// Благодаря ему страница теста откроется, даже если ученик обновит её без интернета.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

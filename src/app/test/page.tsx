import type { Metadata } from "next";

import { TestRunner } from "./test-runner";

export const metadata: Metadata = { title: "Тест — IT Викторина" };

// Страница теста статическая: service worker сохраняет её, и она открывается без интернета.
export default function TestPage() {
  return <TestRunner />;
}

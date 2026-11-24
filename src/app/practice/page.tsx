import type { Metadata } from "next";

import { Practice } from "./practice";

export const metadata: Metadata = { title: "Тренировка — IT Викторина" };

// Тренировка: ученик в любое время выбирает тему и решает вопросы, правильный ответ виден сразу
export default function PracticePage() {
  return <Practice />;
}

import type { Metadata } from "next";

import { Typing } from "./typing";

export const metadata: Metadata = { title: "Печатание — IT Викторина" };

// Печатание на скорость: /typing?room=… — тест учителя (тренировки печатания на сайте нет)
export default function TypingPage() {
  return <Typing />;
}

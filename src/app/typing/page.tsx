import type { Metadata } from "next";

import { Typing } from "./typing";

export const metadata: Metadata = { title: "Печатание — IT Викторина" };

// Печатание на скорость: /typing — тренировка, /typing?room=… — тест учителя
export default function TypingPage() {
  return <Typing />;
}

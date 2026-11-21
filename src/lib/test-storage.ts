// Всё состояние теста ученика хранится в localStorage браузера.
// Поэтому тест продолжается без интернета и даже после перезагрузки страницы.
import type { Behaviour, TestQuestion } from "./types";

export type Phase = "lobby" | "ready" | "running" | "finishing" | "submitted" | "closed";

export type Current = { roomId: string; userId: string; name: string; title: string };

export type Saved = {
  v: 1;
  roomId: string;
  userId: string;
  name: string;
  title: string;
  phase: Phase;
  test: { endsAt: number; offset: number; questions: TestQuestion[] } | null;
  order: number[]; // в каком порядке этот ученик видит вопросы (индексы)
  optionOrder: Record<number, number[]>; // порядок вариантов для каждого вопроса
  answers: Record<number, number>; // номер вопроса → номер выбранного варианта (исходный)
  current: number;
  behaviour: Behaviour;
  startedAt: number | null;
  finishedAt: number | null;
  result: { score: number; total: number } | null;
};

const CURRENT_KEY = "quiz:current";
const key = (roomId: string, userId: string) => `quiz:v1:${roomId}:${userId}`;

function read<T>(storageKey: string): T | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(storageKey: string, value: unknown) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // память браузера переполнена или запрещена — тест продолжится, но без сохранения
  }
}

export function getCurrent(): Current | null {
  return read<Current>(CURRENT_KEY);
}

export function setCurrent(current: Current) {
  write(CURRENT_KEY, current);
}

export function clearCurrent() {
  try {
    localStorage.removeItem(CURRENT_KEY);
  } catch {}
}

export function loadSaved(current: Current): Saved {
  const saved = read<Saved>(key(current.roomId, current.userId));
  if (saved?.v === 1) return saved;
  return {
    v: 1,
    ...current,
    phase: "lobby",
    test: null,
    order: [],
    optionOrder: {},
    answers: {},
    current: 0,
    behaviour: { leaves: 0, awayMs: 0, onlineCount: 0, onlineMode: false },
    startedAt: null,
    finishedAt: null,
    result: null,
  };
}

export function persist(saved: Saved) {
  write(key(saved.roomId, saved.userId), saved);
}

// Есть ли незаконченный тест у этого ученика (чтобы показать «Вернуться к тесту»)
export function unfinishedTest(userId: string): Current | null {
  const current = getCurrent();
  if (!current || current.userId !== userId) return null;
  const saved = read<Saved>(key(current.roomId, current.userId));
  if (saved && (saved.phase === "submitted" || saved.phase === "closed")) return null;
  return current;
}

export function shuffled(length: number) {
  const items = Array.from({ length }, (_, index) => index);
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

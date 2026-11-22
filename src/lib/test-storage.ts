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
  // Когда ученик ушёл со страницы. Хранится здесь, а не в памяти: если телефон
  // закроет вкладку в фоне, после возвращения уход всё равно засчитается.
  awaySince?: number | null;
  // Тест закончился сам, потому что вышло время (а не ученик нажал «Завершить»).
  // Если учитель потом продлит время, такой тест можно продолжить.
  timedOut?: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  result: { score: number; total: number } | null;
};

const CURRENT_KEY = "quiz:current";
const PREFIX = "quiz:v1:";
const key = (roomId: string, userId: string) => `${PREFIX}${roomId}:${userId}`;

// В этих фазах на устройстве лежат ответы, которые ещё не ушли учителю
const UNSENT: Phase[] = ["ready", "running", "finishing"];

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

function remove(storageKey: string) {
  try {
    localStorage.removeItem(storageKey);
  } catch {}
}

function savedKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
  } catch {}
  return keys;
}

// Старые тесты удаляем, иначе за год память браузера (около 5 МБ) переполнится
// и новый тест перестанет сохраняться. Тесты с неотправленными ответами не трогаем.
function prune(keep: string) {
  for (const k of savedKeys()) {
    if (k === keep) continue;
    const saved = read<Saved>(k);
    if (!saved || !UNSENT.includes(saved.phase)) remove(k);
  }
}

export function getCurrent(): Current | null {
  return read<Current>(CURRENT_KEY);
}

export function setCurrent(current: Current) {
  write(CURRENT_KEY, current);
  prune(key(current.roomId, current.userId));
}

export function clearCurrent() {
  remove(CURRENT_KEY);
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
    awaySince: null,
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
  if (current?.userId === userId) {
    const saved = read<Saved>(key(current.roomId, userId));
    if (!saved || (saved.phase !== "submitted" && saved.phase !== "closed")) return current;
  }

  // Указатель потерялся (ученик выходил из аккаунта или на этом устройстве входил
  // другой ученик) — ищем тест, ответы которого ещё не отправлены
  for (const k of savedKeys()) {
    if (!k.endsWith(`:${userId}`)) continue;
    const saved = read<Saved>(k);
    if (saved && UNSENT.includes(saved.phase)) {
      const found: Current = { roomId: saved.roomId, userId, name: saved.name, title: saved.title };
      write(CURRENT_KEY, found);
      return found;
    }
  }
  return null;
}

export function shuffled(length: number) {
  const items = Array.from({ length }, (_, index) => index);
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

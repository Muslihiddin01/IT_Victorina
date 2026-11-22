// Типы, общие для сервера и браузера.

export type Role = "admin" | "student";

export type Me = {
  id: string;
  name: string;
  login: string;
  role: Role;
};

export type Topic = {
  id: number;
  title: string;
  position: number;
  questionCount: number;
};

export type Question = {
  id: string;
  topicId: number;
  text: string;
  options: string[];
  correct: number; // номер правильного варианта (с нуля)
  explanation: string; // почему ответ правильный (может быть пустым)
};

export type Student = {
  id: string;
  name: string;
  login: string;
  createdAt: number;
};

export type RoomStatus = "waiting" | "running" | "finished";

export type Room = {
  id: string;
  code: string;
  title: string;
  status: RoomStatus;
  durationMin: number;
  questionCount: number;
  topicIds: number[];
  createdAt: number;
  startedAt: number | null;
  endsAt: number | null;
  finishedAt: number | null;
  participants: number;
  submitted: number;
};

// Когда тест закончился на самом деле: вышло время или учитель завершил его раньше.
// Кто закончил решать позже (с запасом 30 секунд) — «позже времени»: разбор уже мог быть открыт.
export function deadlineOf(endsAt: number | null, finishedAt: number | null): number | null {
  if (endsAt === null) return null;
  return finishedAt !== null ? Math.min(endsAt, finishedAt) : endsAt;
}

// Что ученик делал во время теста (собирается в браузере)
export type Behaviour = {
  leaves: number; // сколько раз уходил со страницы
  awayMs: number; // сколько всего времени был не на странице
  onlineCount: number; // сколько раз включал интернет во время теста
  onlineMode: boolean; // решал, не выключив интернет
};

export type Participant = Behaviour & {
  id: string;
  name: string;
  login: string;
  joinedAt: number;
  lastSeenAt: number;
  loadedAt: number | null; // когда скачал тест
  submittedAt: number | null;
  finishedAt: number | null; // когда закончил решать (по часам сервера)
  answered: number | null;
  score: number | null;
  total: number | null;
  lastEventAt: number | null; // последнее «живое» нарушение
  answers: Record<string, number> | null; // номер вопроса → выбранный вариант (после сдачи)
};

// Вопрос комнаты для учителя — вместе с правильным ответом
export type RoomQuestion = {
  n: number;
  topic: string;
  text: string;
  options: string[];
  correct: number;
  explanation: string;
};

export type RoomDetail = {
  room: Room;
  participants: Participant[];
  serverNow: number;
};

// Вопрос в том виде, в каком его получает ученик (без правильного ответа!)
export type TestQuestion = {
  n: number;
  topic: string;
  text: string;
  options: string[];
};

export type RoomState = {
  room: {
    id: string;
    title: string;
    status: RoomStatus;
    durationMin: number;
    questionCount: number;
    endsAt: number | null;
  };
  joinedCount: number;
  me: { submitted: boolean; score: number | null; total: number | null };
  serverNow: number;
};

export type TestPayload = {
  roomId: string;
  title: string;
  endsAt: number;
  serverNow: number;
  questions: TestQuestion[];
};

export type SubmitResult = {
  score: number;
  total: number;
};

export type ReviewItem = {
  n: number;
  topic: string;
  text: string;
  options: string[];
  correct: number;
  chosen: number | null;
  explanation: string;
};

export type ResultPayload = {
  score: number | null;
  total: number | null;
  roomStatus: RoomStatus;
  review: ReviewItem[] | null; // разбор доступен после завершения теста учителем
};

// Типы, общие для сервера и браузера.

// Адрес картинки вопроса
export const imageUrl = (id: string) => `/api/images/${id}`;

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
  titleTj: string | null; // название по-таджикски (может отсутствовать)
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
  // Перевод на таджикский. Варианты идут парами: optionsTj[2] — перевод options[2].
  textTj: string | null;
  optionsTj: string[] | null;
  explanationTj: string;
  image: string | null; // id картинки (адрес — imageUrl(id)) или null
};

export type Student = {
  id: string;
  name: string;
  login: string;
  groupId: number | null;
  createdAt: number;
};

export type Group = { id: number; name: string; students: number };

// Общий журнал группы: тесты (столбцы) и лучший результат печатания
export type ClassJournalRoom = { id: string; title: string; code: string; date: number; running: boolean };
export type ClassJournalStudent = {
  id: string;
  name: string;
  login: string;
  typingBest: number | null; // лучший результат: тренировка и тесты учителя
  typingPassedAt: number | null; // когда впервые набрал текущую норму
  // roomId → результат; нет ключа — ученик не заходил в эту комнату
  results: Record<string, { score: number | null; total: number | null; submitted: boolean }>;
};
export type ClassJournal = {
  groups: Group[];
  groupId: number | null; // null — ученики без группы
  ungrouped: number; // сколько учеников без группы
  typingGoal: number;
  rooms: ClassJournalRoom[]; // новые — первыми
  students: ClassJournalStudent[];
};

// Печатание в тренировке: рекорд ученика и норма
export type TypingMe = { best: number | null; goal: number };

// Журнал успеваемости: все тесты одного ученика (старые — первыми)
export type JournalTest = {
  roomId: string;
  kind: RoomKind;
  wpm: number | null;
  title: string;
  code: string;
  running: boolean; // тест ещё идёт
  date: number;
  submitted: boolean;
  score: number | null;
  total: number | null;
  leaves: number;
  onlineCount: number;
  onlineMode: boolean;
};

export type StudentJournal = {
  student: { id: string; name: string; login: string };
  tests: JournalTest[];
};

// quiz — обычный тест с вопросами, typing — печатание на скорость
export type RoomKind = "quiz" | "typing";

export type RoomStatus = "waiting" | "running" | "finished";

export type Room = {
  id: string;
  code: string;
  title: string;
  status: RoomStatus;
  durationMin: number;
  questionCount: number;
  topicIds: number[];
  kind: RoomKind;
  typingSec: number | null; // для печатания: 30 или 60 секунд
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
  wpm: number | null; // печатание: слов в минуту
};

// Вопрос комнаты для учителя — вместе с правильным ответом
export type RoomQuestion = {
  n: number;
  image: string | null;
  topic: string;
  text: string;
  options: string[];
  correct: number;
  explanation: string;
};

export type RoomDetail = {
  room: Room;
  participants: Participant[];
  typingGoal: number | null; // печатание: норма слов в минуту для этого теста
  serverNow: number;
};

// Таджикский вариант вопроса (если учитель его заполнил). Пусто — показываем русский.
export type Translation = {
  image?: string | null; // картинка к вопросу (не перевод, но нужна везде, где показывается вопрос)
  topicTj?: string | null;
  textTj?: string | null;
  optionsTj?: string[] | null;
};

// Вопрос в том виде, в каком его получает ученик (без правильного ответа!)
export type TestQuestion = Translation & {
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
    kind: RoomKind;
    typingSec: number | null;
    typingGoal: number | null; // печатание: норма слов в минуту для этого теста
  };
  joinedCount: number;
  me: { submitted: boolean; score: number | null; total: number | null; wpm: number | null };
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

export type ReviewItem = Translation & {
  n: number;
  topic: string;
  text: string;
  options: string[];
  correct: number;
  chosen: number | null;
  explanation: string;
  explanationTj?: string;
};

export type ResultPayload = {
  score: number | null;
  total: number | null;
  roomStatus: RoomStatus;
  review: ReviewItem[] | null; // разбор доступен после завершения теста учителем
};

// Тренировка: ученик сам выбирает тему и решает, когда хочет (без оценки и времени)
export type PracticeTopic = { id: number; title: string; titleTj: string | null; count: number };

export type PracticeQuestion = Translation & {
  n: number;
  topic: string;
  text: string;
  options: string[];
  correct: number; // в тренировке правильный ответ показывается сразу после выбора
  explanation: string;
  explanationTj: string;
};

export type PracticeSet = { title: string; titleTj: string | null; questions: PracticeQuestion[] };

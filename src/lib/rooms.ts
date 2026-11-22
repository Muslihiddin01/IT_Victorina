import "server-only";

import { randomInt } from "node:crypto";

import { ms, type Db } from "./db";
import { HttpError } from "./http";
import type { Behaviour, Participant, Room } from "./types";

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 4 цифры, которых нет у других незавершённых комнат
export async function generateCode(db: Db): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = String(randomInt(1000, 10000));
    const taken = await db.query("SELECT 1 FROM rooms WHERE code = $1 AND status <> 'finished'", [code]);
    if (taken.length === 0) return code;
  }
  throw new HttpError(500, "Не удалось подобрать код комнаты, попробуйте ещё раз");
}

type QuestionRow = { id: string; topic_id: number; topic_title: string; text: string; options: string[]; correct: number };

// Берём вопросы из выбранных тем по кругу, чтобы темы перемешались поровну
export async function pickQuestions(db: Db, topicIds: number[], count: number) {
  const rows = await db.query<QuestionRow>(
    `SELECT q.id, q.topic_id, t.title AS topic_title, q.text, q.options, q.correct
       FROM questions q JOIN topics t ON t.id = q.topic_id`,
  );
  const allowed = new Set(topicIds);
  const byTopic = new Map<number, QuestionRow[]>();
  for (const row of rows) {
    if (allowed.size > 0 && !allowed.has(row.topic_id)) continue;
    byTopic.set(row.topic_id, [...(byTopic.get(row.topic_id) ?? []), row]);
  }
  const queues = shuffle([...byTopic.values()].map((list) => shuffle(list)));
  const picked: QuestionRow[] = [];
  while (picked.length < count && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && picked.length < count) picked.push(next);
    }
  }

  // Перемешиваем порядок вопросов и вариантов, запоминаем, где теперь правильный
  return shuffle(picked).map((question) => {
    const order = shuffle(question.options.map((_, index) => index));
    return {
      topic: question.topic_title,
      text: question.text,
      options: order.map((index) => question.options[index]),
      correct: order.indexOf(question.correct),
    };
  });
}

type RoomRow = {
  id: string;
  code: string;
  title: string;
  status: Room["status"];
  duration_min: number;
  question_count: number;
  topic_ids: number[];
  created_at: Date;
  started_at: Date | null;
  ends_at: Date | null;
  finished_at: Date | null;
  participants?: number;
  submitted?: number;
};

export const ROOM_COLUMNS = `r.id, r.code, r.title, r.status, r.duration_min, r.question_count, r.topic_ids,
  r.created_at, r.started_at, r.ends_at, r.finished_at,
  (SELECT count(*)::int FROM participants p WHERE p.room_id = r.id) AS participants,
  (SELECT count(*)::int FROM participants p WHERE p.room_id = r.id AND p.submitted_at IS NOT NULL) AS submitted`;

export function mapRoom(row: RoomRow): Room {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    status: row.status,
    durationMin: row.duration_min,
    questionCount: row.question_count,
    topicIds: row.topic_ids ?? [],
    createdAt: ms(row.created_at)!,
    startedAt: ms(row.started_at),
    endsAt: ms(row.ends_at),
    finishedAt: ms(row.finished_at),
    participants: row.participants ?? 0,
    submitted: row.submitted ?? 0,
  };
}

export async function getRoom(db: Db, id: string): Promise<Room> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Комната не найдена");
  const [row] = await db.query<RoomRow>(`SELECT ${ROOM_COLUMNS} FROM rooms r WHERE r.id = $1::uuid`, [id]);
  if (!row) throw new HttpError(404, "Комната не найдена");
  return mapRoom(row);
}

type ParticipantRow = {
  id: string;
  name: string;
  login: string;
  joined_at: Date;
  last_seen_at: Date;
  loaded_at: Date | null;
  submitted_at: Date | null;
  finished_at: Date | null;
  answered: number | null;
  score: number | null;
  total: number | null;
  leaves: number;
  away_ms: number;
  online_count: number;
  online_mode: boolean;
  last_event_at: Date | null;
  answers: Record<string, number> | null;
};

export async function getParticipants(db: Db, roomId: string): Promise<Participant[]> {
  const rows = await db.query<ParticipantRow>(
    `SELECT id, name, login, joined_at, last_seen_at, loaded_at, submitted_at, finished_at,
            answered, score, total, leaves, away_ms, online_count, online_mode, last_event_at, answers
       FROM participants WHERE room_id = $1::uuid
      ORDER BY score DESC NULLS LAST, name`,
    [roomId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    login: row.login,
    joinedAt: ms(row.joined_at)!,
    lastSeenAt: ms(row.last_seen_at)!,
    loadedAt: ms(row.loaded_at),
    submittedAt: ms(row.submitted_at),
    finishedAt: ms(row.finished_at),
    answered: row.answered,
    score: row.score,
    total: row.total,
    leaves: row.leaves,
    awayMs: row.away_ms,
    onlineCount: row.online_count,
    onlineMode: row.online_mode,
    lastEventAt: ms(row.last_event_at),
    answers: row.answers,
  }));
}

// Приводим присланные браузером данные о поведении к безопасному виду
export function cleanBehaviour(input: Partial<Behaviour> | undefined): Behaviour {
  const int = (value: unknown, max: number) =>
    Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
  return {
    leaves: int(input?.leaves, 10_000),
    awayMs: int(input?.awayMs, 2_000_000_000),
    onlineCount: int(input?.onlineCount, 10_000),
    onlineMode: Boolean(input?.onlineMode),
  };
}

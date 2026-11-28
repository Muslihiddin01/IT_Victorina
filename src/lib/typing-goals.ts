import "server-only";

import { ms, type Db } from "./db";
import { HttpError } from "./errors";
import type { TypingGoal, TypingGoalStudent, TypingJournal } from "./types";

export const GOAL_MIN = 5;
export const GOAL_MAX = 200;

// Все этапы, новые — первыми. Этап кончается, когда начинается следующий.
export async function getGoals(db: Db): Promise<TypingGoal[]> {
  const rows = await db.query<{ id: number; wpm: number; started_at: Date }>(
    "SELECT id, wpm, started_at FROM typing_goals ORDER BY started_at DESC, id DESC",
  );
  return rows.map((row, i) => ({
    id: Number(row.id),
    wpm: Number(row.wpm),
    startedAt: ms(row.started_at)!,
    endedAt: i === 0 ? null : ms(rows[i - 1].started_at),
  }));
}

// Норма для теста, который начался в это время (тест до первого этапа — по первому этапу)
export async function goalAt(db: Db, at: number | null): Promise<number | null> {
  const goals = await getGoals(db);
  const time = at ?? Date.now();
  return (goals.find((goal) => goal.startedAt <= time) ?? goals.at(-1))?.wpm ?? null;
}

// Журнал этапа: лучший результат каждого ученика в тестах печатания этого этапа
export async function getTypingJournal(db: Db, goalId?: number): Promise<TypingJournal> {
  const goals = await getGoals(db);
  const goal = goalId ? goals.find((item) => item.id === goalId) : goals[0];
  if (!goal) throw new HttpError(404, "Этап не найден");

  const from = new Date(goal.startedAt).toISOString();
  const to = goal.endedAt === null ? null : new Date(goal.endedAt).toISOString();
  const rows = await db.query<{
    id: string;
    name: string;
    login: string;
    best: number | null;
    attempts: number;
    passed_at: Date | null;
  }>(
    `SELECT u.id, u.name, u.login, max(t.wpm) AS best, count(t.wpm)::int AS attempts,
            min(t.at) FILTER (WHERE t.wpm >= $3::int) AS passed_at
       FROM users u
       LEFT JOIN (
         SELECT p.user_id, p.wpm, coalesce(p.submitted_at, r.started_at) AS at
           FROM participants p JOIN rooms r ON r.id = p.room_id
          WHERE r.kind = 'typing' AND p.wpm IS NOT NULL
            AND r.started_at >= $1::timestamptz
            AND ($2::timestamptz IS NULL OR r.started_at < $2::timestamptz)
       ) t ON t.user_id = u.id
      WHERE u.role = 'student' AND ($2::timestamptz IS NULL OR u.created_at < $2::timestamptz)
      GROUP BY u.id, u.name, u.login
      ORDER BY u.name`,
    [from, to, goal.wpm],
  );
  const students: TypingGoalStudent[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    login: row.login,
    best: row.best === null ? null : Number(row.best),
    attempts: Number(row.attempts),
    passedAt: ms(row.passed_at),
  }));
  return { goals, goal, students };
}

// Новый этап с новой нормой (например, второй месяц — 40 слов в минуту)
export async function startGoal(db: Db, wpm: unknown): Promise<void> {
  if (!Number.isInteger(wpm) || (wpm as number) < GOAL_MIN || (wpm as number) > GOAL_MAX) {
    throw new HttpError(400, `Норма — целое число от ${GOAL_MIN} до ${GOAL_MAX}`);
  }
  await db.query("INSERT INTO typing_goals (wpm) VALUES ($1::int)", [wpm]);
}

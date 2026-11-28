import "server-only";

import { ms, type Db } from "./db";
import { HttpError } from "./errors";

export const GOAL_MIN = 5;
export const GOAL_MAX = 200;

// Норма печатания меняется этапами (первый месяц — 30, потом 40…). Каждый этап — строка typing_goals.
// Тест учителя сравнивается с нормой, которая действовала, когда он начался.
async function getGoals(db: Db) {
  const rows = await db.query<{ wpm: number; started_at: Date }>(
    "SELECT wpm, started_at FROM typing_goals ORDER BY started_at DESC, id DESC",
  );
  return rows.map((row) => ({ wpm: Number(row.wpm), startedAt: ms(row.started_at)! }));
}

// Норма для теста, который начался в это время (без времени — норма сейчас)
export async function goalAt(db: Db, at: number | null): Promise<number> {
  const goals = await getGoals(db);
  const time = at ?? Date.now();
  return (goals.find((goal) => goal.startedAt <= time) ?? goals.at(-1))?.wpm ?? 30;
}

// Новая норма с этой минуты (например, второй месяц — 40 слов в минуту)
export async function startGoal(db: Db, wpm: unknown): Promise<void> {
  if (!Number.isInteger(wpm) || (wpm as number) < GOAL_MIN || (wpm as number) > GOAL_MAX) {
    throw new HttpError(400, `Норма — целое число от ${GOAL_MIN} до ${GOAL_MAX}`);
  }
  await db.query("INSERT INTO typing_goals (wpm) VALUES ($1::int)", [wpm]);
}

// Лучший результат печатания учеников: и тренировка, и тесты учителя.
// passedAt — когда ученик впервые набрал норму goal.
export async function typingBests(db: Db, userIds: string[], goal: number) {
  if (userIds.length === 0) return new Map<string, { best: number; passedAt: number | null }>();
  const rows = await db.query<{ user_id: string; best: number; passed_at: Date | null }>(
    `SELECT user_id, max(wpm) AS best, min(at) FILTER (WHERE wpm >= $2::int) AS passed_at
       FROM (
         SELECT user_id, wpm, created_at AS at FROM typing_results
         UNION ALL
         SELECT p.user_id, p.wpm, coalesce(p.submitted_at, r.started_at) AS at
           FROM participants p JOIN rooms r ON r.id = p.room_id
          WHERE r.kind = 'typing' AND p.wpm IS NOT NULL
       ) t
      WHERE user_id IN (SELECT jsonb_array_elements_text($1::text::jsonb)::uuid)
      GROUP BY user_id`,
    [JSON.stringify(userIds), goal],
  );
  return new Map(rows.map((row) => [row.user_id, { best: Number(row.best), passedAt: ms(row.passed_at) }]));
}

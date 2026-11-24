import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { json, route } from "@/lib/http";
import type { PracticeTopic } from "@/lib/types";

// GET /api/practice — темы для тренировки (только те, где есть вопросы)
export const GET = route(async (req) => {
  await requireUser(req);
  const db = await getDb();
  const topics = await db.query<PracticeTopic>(
    `SELECT t.id, t.title, t.title_tj AS "titleTj", count(q.id)::int AS count
       FROM topics t JOIN questions q ON q.topic_id = t.id
      GROUP BY t.id ORDER BY t.position, t.id`,
  );
  return json({ topics });
});

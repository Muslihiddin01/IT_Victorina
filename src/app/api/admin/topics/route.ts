import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";

// POST /api/admin/topics — новая тема (например, «Урок 8»)
export const POST = route(async (req) => {
  await requireUser(req, "admin");
  const body = await readJson<{ title?: string }>(req);
  const title = body.title?.trim().slice(0, 120);
  if (!title) throw new HttpError(400, "Введите название темы");
  const db = await getDb();
  const [row] = await db.query<{ id: number }>(
    `INSERT INTO topics (title, position)
     VALUES ($1, (SELECT coalesce(max(position), 0) + 1 FROM topics)) RETURNING id`,
    [title],
  );
  return json({ id: row.id }, 201);
});

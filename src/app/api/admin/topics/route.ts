import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import { cleanTitle } from "@/lib/questions";

// POST /api/admin/topics — новая тема (например, «Урок 8»)
export const POST = route(async (req) => {
  await requireUser(req, "admin");
  const body = await readJson<{ title?: string; titleTj?: string }>(req);
  const title = cleanTitle(body.title);
  const titleTj = cleanTitle(body.titleTj) || null;
  if (!title) throw new HttpError(400, "Введите название темы");
  const db = await getDb();
  const [row] = await db.query<{ id: number }>(
    `INSERT INTO topics (title, title_tj, position)
     VALUES ($1, $2, (SELECT coalesce(max(position), 0) + 1 FROM topics)) RETURNING id`,
    [title, titleTj],
  );
  return json({ id: row.id }, 201);
});

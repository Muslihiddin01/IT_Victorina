import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import { cleanTitle } from "@/lib/questions";

function topicId(id: string) {
  const value = Number(id);
  if (!Number.isInteger(value)) throw new HttpError(404, "Тема не найдена");
  return value;
}

// PATCH /api/admin/topics/:id — переименовать тему (по-русски и по-таджикски)
export const PATCH = route(async (req, { id }) => {
  await requireUser(req, "admin");
  const body = await readJson<{ title?: string; titleTj?: string }>(req);
  const title = cleanTitle(body.title);
  const titleTj = cleanTitle(body.titleTj) || null;
  if (!title) throw new HttpError(400, "Введите название темы");
  const db = await getDb();
  const rows = await db.query("UPDATE topics SET title = $1, title_tj = $3 WHERE id = $2::int RETURNING id", [
    title,
    topicId(id),
    titleTj,
  ]);
  if (rows.length === 0) throw new HttpError(404, "Тема не найдена");
  return json({ ok: true });
});

// DELETE /api/admin/topics/:id — удалить пустую тему
export const DELETE = route(async (req, { id }) => {
  await requireUser(req, "admin");
  const db = await getDb();
  const [{ count }] = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM questions WHERE topic_id = $1::int",
    [topicId(id)],
  );
  if (count > 0) throw new HttpError(409, "Сначала удалите или перенесите вопросы этой темы");
  await db.query("DELETE FROM topics WHERE id = $1::int", [topicId(id)]);
  return json({ ok: true });
});

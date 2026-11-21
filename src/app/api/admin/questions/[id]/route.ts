import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import { cleanQuestion, type QuestionInput } from "@/lib/questions";

function checkId(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Вопрос не найден");
}

// PUT /api/admin/questions/:id — изменить вопрос
export const PUT = route(async (req, { id }) => {
  await requireUser(req, "admin");
  checkId(id);
  const question = cleanQuestion(await readJson<QuestionInput>(req));
  const db = await getDb();
  const rows = await db.query(
    `UPDATE questions SET topic_id = $1::int, text = $2, options = $3::text::jsonb, correct = $4::int
      WHERE id = $5::uuid RETURNING id`,
    [question.topicId, question.text, JSON.stringify(question.options), question.correct, id],
  );
  if (rows.length === 0) throw new HttpError(404, "Вопрос не найден");
  return json({ ok: true });
});

// DELETE /api/admin/questions/:id — удалить вопрос
export const DELETE = route(async (req, { id }) => {
  await requireUser(req, "admin");
  checkId(id);
  const db = await getDb();
  const rows = await db.query("DELETE FROM questions WHERE id = $1::uuid RETURNING id", [id]);
  if (rows.length === 0) throw new HttpError(404, "Вопрос не найден");
  return json({ ok: true });
});

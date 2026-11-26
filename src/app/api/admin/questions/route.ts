import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import { checkImage, cleanQuestion, jsonOrNull, type QuestionInput } from "@/lib/questions";
import type { Question, Topic } from "@/lib/types";

// GET /api/admin/questions — все темы и вопросы
export const GET = route(async (req) => {
  await requireUser(req, "admin");
  const db = await getDb();
  const topics = await db.query<Topic>(
    `SELECT t.id, t.title, t.title_tj AS "titleTj", t.position,
            (SELECT count(*)::int FROM questions q WHERE q.topic_id = t.id) AS "questionCount"
       FROM topics t ORDER BY t.position, t.id`,
  );
  const questions = await db.query<Question>(
    `SELECT q.id, q.topic_id AS "topicId", q.text, q.options, q.correct, q.explanation,
            q.text_tj AS "textTj", q.options_tj AS "optionsTj", q.explanation_tj AS "explanationTj", q.image
       FROM questions q JOIN topics t ON t.id = q.topic_id
      ORDER BY t.position, q.created_at`,
  );
  return json({ topics, questions });
});

// POST /api/admin/questions — новый вопрос
export const POST = route(async (req) => {
  await requireUser(req, "admin");
  const question = cleanQuestion(await readJson<QuestionInput>(req));
  const db = await getDb();
  const topic = await db.query("SELECT 1 FROM topics WHERE id = $1::int", [question.topicId]);
  if (topic.length === 0) throw new HttpError(400, "Такой темы нет");
  await checkImage(db, question.image);
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO questions (topic_id, text, options, correct, explanation, text_tj, options_tj, explanation_tj, image)
     VALUES ($1::int, $2, $3::text::jsonb, $4::int, $5, $6, $7::text::jsonb, $8, $9) RETURNING id`,
    [
      question.topicId,
      question.text,
      JSON.stringify(question.options),
      question.correct,
      question.explanation,
      question.textTj,
      jsonOrNull(question.optionsTj),
      question.explanationTj,
      question.image ?? null,
    ],
  );
  return json({ id: row.id }, 201);
});

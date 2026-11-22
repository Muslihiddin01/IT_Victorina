import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import { cleanQuestion } from "@/lib/questions";

type Item = { topic?: string | null; text?: string; options?: string[]; correct?: number; explanation?: string };

// POST /api/admin/questions/bulk — добавить сразу много вопросов.
// { topicId, questions: [...] }: вопрос без своей темы попадает в topicId.
// Если у вопроса указана тема по названию и такой темы нет — она создаётся.
// Всё или ничего: при ошибке ни один вопрос не добавится.
export const POST = route(async (req) => {
  await requireUser(req, "admin");
  const body = await readJson<{ topicId?: number; questions?: Item[] }>(req);
  const items = Array.isArray(body.questions) ? body.questions : [];
  if (items.length === 0) throw new HttpError(400, "Нет ни одного вопроса");
  if (items.length > 500) throw new HttpError(400, "За один раз можно добавить до 500 вопросов");

  const db = await getDb();
  const result = await db.tx(async (tx) => {
    const topics = await tx.query<{ id: number; title: string }>("SELECT id, title FROM topics");
    const byTitle = new Map(topics.map((t) => [t.title.trim().toLowerCase(), t.id]));
    const createdTopics: string[] = [];

    const topicFor = async (title: string | null | undefined) => {
      const clean = title?.trim().slice(0, 120);
      if (!clean) {
        if (!topics.some((t) => t.id === body.topicId)) throw new HttpError(400, "Выберите тему для вопросов без «# темы»");
        return body.topicId!;
      }
      const known = byTitle.get(clean.toLowerCase());
      if (known) return known;
      const [row] = await tx.query<{ id: number }>(
        `INSERT INTO topics (title, position)
         VALUES ($1, (SELECT coalesce(max(position), 0) + 1 FROM topics)) RETURNING id`,
        [clean],
      );
      byTitle.set(clean.toLowerCase(), row.id);
      createdTopics.push(clean);
      return row.id;
    };

    for (const [index, item] of items.entries()) {
      let question;
      try {
        question = cleanQuestion({ ...item, topicId: await topicFor(item.topic) });
      } catch (error) {
        if (error instanceof HttpError) throw new HttpError(400, `Вопрос ${index + 1}: ${error.message}`);
        throw error;
      }
      await tx.query(
        `INSERT INTO questions (topic_id, text, options, correct, explanation)
         VALUES ($1::int, $2, $3::text::jsonb, $4::int, $5)`,
        [question.topicId, question.text, JSON.stringify(question.options), question.correct, question.explanation],
      );
    }
    return { added: items.length, createdTopics };
  });

  return json(result, 201);
});

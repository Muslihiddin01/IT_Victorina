import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import { jsonOrNull } from "@/lib/questions";
import { getParticipants, getRoom, pickQuestions } from "@/lib/rooms";

// GET /api/admin/rooms/:id — комната, ученики и их результаты (учитель обновляет каждые 2 секунды)
export const GET = route(async (req, { id }) => {
  await requireUser(req, "admin");
  const db = await getDb();
  const room = await getRoom(db, id);
  const participants = await getParticipants(db, room.id);
  return json({ room, participants, serverNow: Date.now() });
});

// PATCH /api/admin/rooms/:id — { action: "start" }, { action: "finish" } или { action: "extend", minutes }
export const PATCH = route(async (req, { id }) => {
  await requireUser(req, "admin");
  const { action, minutes } = await readJson<{ action?: string; minutes?: number }>(req);
  const db = await getDb();
  const room = await getRoom(db, id);

  if (action === "start") {
    await db.tx(async (tx) => {
      // FOR UPDATE — чтобы двойной клик не запустил тест дважды
      const [locked] = await tx.query<{ status: string }>(
        "SELECT status FROM rooms WHERE id = $1::uuid FOR UPDATE",
        [room.id],
      );
      if (locked.status !== "waiting") throw new HttpError(409, "Тест уже запущен");

      const questions = await pickQuestions(tx, room.topicIds, room.questionCount);
      if (questions.length === 0) throw new HttpError(400, "В выбранных темах нет вопросов");
      for (const [index, question] of questions.entries()) {
        await tx.query(
          `INSERT INTO room_questions (room_id, n, topic_title, text, options, correct, explanation,
                                      topic_title_tj, text_tj, options_tj, explanation_tj, image)
           VALUES ($1::uuid, $2::int, $3, $4, $5::text::jsonb, $6::int, $7, $8, $9, $10::text::jsonb, $11, $12)`,
          [
            room.id, index + 1, question.topic, question.text, JSON.stringify(question.options), question.correct,
            question.explanation, question.topicTj, question.textTj, jsonOrNull(question.optionsTj),
            question.explanationTj, question.image,
          ],
        );
      }
      await tx.query(
        `UPDATE rooms SET status = 'running', question_count = $2::int, started_at = now(),
                ends_at = now() + make_interval(mins => duration_min)
          WHERE id = $1::uuid`,
        [room.id, questions.length],
      );
    });
    return json({ ok: true });
  }

  // Продлить тест для всех. Если время уже вышло, добавляем минуты от текущего момента.
  if (action === "extend") {
    const add = Math.round(Number(minutes));
    if (!(add >= 1 && add <= 60)) throw new HttpError(400, "Продлить можно на 1–60 минут");
    const rows = await db.query(
      `UPDATE rooms SET ends_at = GREATEST(ends_at, now()) + make_interval(mins => $2::int)
        WHERE id = $1::uuid AND status = 'running' RETURNING id`,
      [room.id, add],
    );
    if (rows.length === 0) throw new HttpError(409, "Продлить можно только идущий тест");
    return json({ ok: true });
  }

  if (action === "finish") {
    if (room.status === "finished") return json({ ok: true });
    await db.query("UPDATE rooms SET status = 'finished', finished_at = now() WHERE id = $1::uuid", [room.id]);
    return json({ ok: true });
  }

  throw new HttpError(400, "Неизвестное действие");
});

// DELETE /api/admin/rooms/:id — удалить комнату вместе с результатами
export const DELETE = route(async (req, { id }) => {
  await requireUser(req, "admin");
  const db = await getDb();
  const room = await getRoom(db, id);
  await db.query("DELETE FROM rooms WHERE id = $1::uuid", [room.id]);
  return json({ ok: true });
});

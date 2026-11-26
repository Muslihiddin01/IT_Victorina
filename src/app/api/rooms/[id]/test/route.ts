import { HttpError, json, route } from "@/lib/http";
import { loadParticipant } from "@/lib/participant";
import type { TestPayload, TestQuestion } from "@/lib/types";

// GET /api/rooms/:id/test — скачать вопросы теста (без правильных ответов!)
// После этого ученик может выключить интернет: всё нужное уже в браузере.
export const GET = route(async (req, { id }) => {
  const { db, room, participant } = await loadParticipant(req, id);
  if (room.status === "waiting") throw new HttpError(409, "Тест ещё не начался");
  if (room.status === "finished") throw new HttpError(409, "Тест уже завершён");
  if (participant.submitted_at) throw new HttpError(409, "Ты уже отправил ответы");
  // Иначе тест скачался бы и сразу закончился с нулём баллов
  if (room.endsAt !== null && room.endsAt <= Date.now()) throw new HttpError(409, "Время теста уже вышло");

  const questions = await db.query<TestQuestion>(
    `SELECT n, topic_title AS topic, text, options,
            topic_title_tj AS "topicTj", text_tj AS "textTj", options_tj AS "optionsTj", image
       FROM room_questions WHERE room_id = $1::uuid ORDER BY n`,
    [room.id],
  );
  await db.query(
    "UPDATE participants SET loaded_at = coalesce(loaded_at, now()), last_seen_at = now() WHERE id = $1::uuid",
    [participant.id],
  );

  const payload: TestPayload = {
    roomId: room.id,
    title: room.title,
    endsAt: room.endsAt!,
    serverNow: Date.now(),
    questions,
  };
  return json(payload);
});

import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { json, route } from "@/lib/http";
import { getRoom } from "@/lib/rooms";
import type { RoomQuestion } from "@/lib/types";

// GET /api/admin/rooms/:id/questions — вопросы этой игры с правильными ответами.
// Отдельно от GET /api/admin/rooms/:id, потому что вопросы не меняются, а комнату учитель обновляет каждые 2 секунды.
export const GET = route(async (req, { id }) => {
  await requireUser(req, "admin");
  const db = await getDb();
  const room = await getRoom(db, id);
  const questions = await db.query<RoomQuestion>(
    `SELECT n, topic_title AS topic, text, options, correct, explanation
       FROM room_questions WHERE room_id = $1::uuid ORDER BY n`,
    [room.id],
  );
  return json({ questions });
});

import { json, route } from "@/lib/http";
import { loadParticipant } from "@/lib/participant";
import type { ResultPayload, ReviewItem } from "@/lib/types";

// GET /api/rooms/:id/result — баллы ученика и разбор ошибок.
// Разбор открывается только после того, как учитель завершит тест,
// иначе первые сдавшие могли бы подсказать остальным.
export const GET = route(async (req, { id }) => {
  const { db, room, participant } = await loadParticipant(req, id);
  let review: ReviewItem[] | null = null;

  if (room.status === "finished" && participant.submitted_at) {
    const rows = await db.query<Omit<ReviewItem, "chosen">>(
      `SELECT n, topic_title AS topic, text, options, correct, explanation,
              topic_title_tj AS "topicTj", text_tj AS "textTj", options_tj AS "optionsTj",
              explanation_tj AS "explanationTj"
         FROM room_questions WHERE room_id = $1::uuid ORDER BY n`,
      [room.id],
    );
    review = rows.map((row) => ({ ...row, chosen: participant.answers?.[String(row.n)] ?? null }));
  }

  const payload: ResultPayload = {
    score: participant.score,
    total: participant.total,
    roomStatus: room.status,
    review,
  };
  return json(payload);
});

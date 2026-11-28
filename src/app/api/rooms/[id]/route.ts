import { json, route } from "@/lib/http";
import { loadParticipant } from "@/lib/participant";
import type { RoomState } from "@/lib/types";

// GET /api/rooms/:id — состояние комнаты для ученика (браузер спрашивает каждые 2 секунды)
export const GET = route(async (req, { id }) => {
  const { db, room, participant } = await loadParticipant(req, id);
  await db.query("UPDATE participants SET last_seen_at = now() WHERE id = $1::uuid", [participant.id]);

  const state: RoomState = {
    room: {
      id: room.id,
      title: room.title,
      status: room.status,
      durationMin: room.durationMin,
      questionCount: room.questionCount,
      endsAt: room.endsAt,
      kind: room.kind,
      typingSec: room.typingSec,
    },
    joinedCount: room.participants,
    me: {
      submitted: Boolean(participant.submitted_at),
      score: participant.score,
      total: participant.total,
      wpm: participant.wpm,
    },
    serverNow: Date.now(),
  };
  return json(state);
});

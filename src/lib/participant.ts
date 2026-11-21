import "server-only";

import type { NextRequest } from "next/server";

import { requireUser } from "./auth";
import { getDb, type Db } from "./db";
import { HttpError } from "./http";
import { getRoom } from "./rooms";
import type { Me, Room } from "./types";

export type ParticipantRow = {
  id: string;
  submitted_at: Date | null;
  score: number | null;
  total: number | null;
  answers: Record<string, number> | null;
};

// Общая проверка для маршрутов ученика: вошёл ли он и есть ли он в этой комнате
export async function loadParticipant(
  req: NextRequest,
  roomId: string,
): Promise<{ db: Db; user: Me; room: Room; participant: ParticipantRow }> {
  const user = await requireUser(req, "student");
  const db = await getDb();
  const room = await getRoom(db, roomId);
  const [participant] = await db.query<ParticipantRow>(
    `SELECT id, submitted_at, score, total, answers
       FROM participants WHERE room_id = $1::uuid AND user_id = $2::uuid`,
    [room.id, user.id],
  );
  if (!participant) throw new HttpError(403, "Сначала войдите в комнату по коду");
  return { db, user, room, participant };
}

import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";

// POST /api/rooms/join — ученик входит в комнату по коду
export const POST = route(async (req) => {
  const user = await requireUser(req, "student");
  const { code } = await readJson<{ code?: string }>(req);
  const clean = String(code ?? "").replace(/\D/g, "");
  if (clean.length !== 4) throw new HttpError(400, "Код комнаты — 4 цифры");

  const db = await getDb();
  const [room] = await db.query<{ id: string; title: string }>(
    "SELECT id, title FROM rooms WHERE code = $1 AND status <> 'finished' ORDER BY created_at DESC LIMIT 1",
    [clean],
  );
  if (!room) throw new HttpError(404, "Комнаты с таким кодом нет или тест уже завершён");

  await db.query(
    `INSERT INTO participants (room_id, user_id, name, login)
     VALUES ($1::uuid, $2::uuid, $3, $4)
     ON CONFLICT (room_id, user_id) DO UPDATE SET last_seen_at = now()`,
    [room.id, user.id, user.name, user.login],
  );
  return json({ roomId: room.id, title: room.title });
});

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
  const [room] = await db.query<{ id: string; title: string; expired: boolean; joined: boolean }>(
    `SELECT r.id, r.title,
            (r.status = 'running' AND r.ends_at <= now()) AS expired,
            EXISTS (SELECT 1 FROM participants p WHERE p.room_id = r.id AND p.user_id = $2::uuid) AS joined
       FROM rooms r
      WHERE r.code = $1 AND r.status <> 'finished'
      ORDER BY r.created_at DESC LIMIT 1`,
    [clean, user.id],
  );
  if (!room) throw new HttpError(404, "Комнаты с таким кодом нет или тест уже завершён");
  // Время вышло, а учитель ещё не нажал «Завершить»: новым ученикам входить уже поздно
  if (room.expired && !room.joined) throw new HttpError(409, "Время этого теста уже вышло");

  await db.query(
    `INSERT INTO participants (room_id, user_id, name, login)
     VALUES ($1::uuid, $2::uuid, $3, $4)
     ON CONFLICT (room_id, user_id) DO UPDATE SET last_seen_at = now()`,
    [room.id, user.id, user.name, user.login],
  );
  return json({ roomId: room.id, title: room.title });
});

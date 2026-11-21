import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import { generateCode, mapRoom, ROOM_COLUMNS } from "@/lib/rooms";

// GET /api/admin/rooms — последние комнаты
export const GET = route(async (req) => {
  await requireUser(req, "admin");
  const db = await getDb();
  const rows = await db.query(`SELECT ${ROOM_COLUMNS} FROM rooms r ORDER BY r.created_at DESC LIMIT 100`);
  return json({ rooms: rows.map((row) => mapRoom(row as never)) });
});

type NewRoom = { title?: string; durationMin?: number; questionCount?: number; topicIds?: number[] };

// POST /api/admin/rooms — создать комнату (тест ещё не начался)
export const POST = route(async (req) => {
  await requireUser(req, "admin");
  const body = await readJson<NewRoom>(req);
  const title = body.title?.trim().slice(0, 120) || "Тест";
  const durationMin = Math.round(Number(body.durationMin));
  const questionCount = Math.round(Number(body.questionCount));
  if (!(durationMin >= 1 && durationMin <= 180)) throw new HttpError(400, "Время теста — от 1 до 180 минут");
  if (!(questionCount >= 1 && questionCount <= 100)) throw new HttpError(400, "Вопросов — от 1 до 100");

  const db = await getDb();
  const topics = await db.query<{ id: number; count: number }>(
    "SELECT t.id, (SELECT count(*)::int FROM questions q WHERE q.topic_id = t.id) AS count FROM topics t",
  );
  const requested = (body.topicIds ?? []).filter((id) => topics.some((topic) => topic.id === id));
  if (requested.length === 0) throw new HttpError(400, "Выберите хотя бы одну тему");
  const available = topics.filter((t) => requested.includes(t.id)).reduce((sum, t) => sum + t.count, 0);
  if (available === 0) throw new HttpError(400, "В выбранных темах нет вопросов");

  const code = await generateCode(db);
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO rooms (code, title, duration_min, question_count, topic_ids)
     VALUES ($1, $2, $3::int, $4::int, $5::jsonb) RETURNING id`,
    [code, title, durationMin, Math.min(questionCount, available), JSON.stringify(requested)],
  );
  return json({ id: row.id, code }, 201);
});

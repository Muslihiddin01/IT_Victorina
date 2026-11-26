import { hashPassword, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ms } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import { generatePassword } from "@/lib/students";
import type { StudentJournal } from "@/lib/types";

function checkId(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Ученик не найден");
}

// GET /api/admin/students/:id — журнал ученика: все его тесты по порядку
export const GET = route(async (req, { id }) => {
  await requireUser(req, "admin");
  checkId(id);
  const db = await getDb();
  const [student] = await db.query<{ id: string; name: string; login: string }>(
    "SELECT id, name, login FROM users WHERE id = $1::uuid AND role = 'student'",
    [id],
  );
  if (!student) throw new HttpError(404, "Ученик не найден");
  const rows = await db.query<{
    room_id: string;
    title: string;
    code: string;
    status: string;
    started_at: Date | null;
    created_at: Date;
    submitted_at: Date | null;
    score: number | null;
    total: number | null;
    leaves: number;
    online_count: number;
    online_mode: boolean;
  }>(
    `SELECT r.id AS room_id, r.title, r.code, r.status, r.started_at, r.created_at,
            p.submitted_at, p.score, p.total, p.leaves, p.online_count, p.online_mode
       FROM participants p JOIN rooms r ON r.id = p.room_id
      WHERE p.user_id = $1::uuid AND r.status <> 'waiting'
      ORDER BY coalesce(r.started_at, r.created_at)`,
    [id],
  );
  const payload: StudentJournal = {
    student,
    tests: rows.map((row) => ({
      roomId: row.room_id,
      title: row.title,
      code: row.code,
      running: row.status === "running",
      date: ms(row.started_at ?? row.created_at)!,
      submitted: row.submitted_at !== null,
      score: row.score,
      total: row.total,
      leaves: row.leaves,
      onlineCount: row.online_count,
      onlineMode: row.online_mode,
    })),
  };
  return json(payload);
});

// PATCH /api/admin/students/:id — новый пароль или новое имя
export const PATCH = route(async (req, { id }) => {
  await requireUser(req, "admin");
  checkId(id);
  const body = await readJson<{ resetPassword?: boolean; name?: string }>(req);
  const db = await getDb();

  if (body.resetPassword) {
    const password = generatePassword();
    const rows = await db.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2::uuid AND role = 'student' RETURNING id",
      [await hashPassword(password), id],
    );
    if (rows.length === 0) throw new HttpError(404, "Ученик не найден");
    // Старые входы ученика больше не действуют
    await db.query("DELETE FROM sessions WHERE user_id = $1::uuid", [id]);
    return json({ password });
  }

  const name = body.name?.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) throw new HttpError(400, "Введите имя");
  const rows = await db.query(
    "UPDATE users SET name = $1 WHERE id = $2::uuid AND role = 'student' RETURNING id",
    [name, id],
  );
  if (rows.length === 0) throw new HttpError(404, "Ученик не найден");
  return json({ ok: true });
});

// DELETE /api/admin/students/:id — удалить ученика (его старые результаты останутся)
export const DELETE = route(async (req, { id }) => {
  await requireUser(req, "admin");
  checkId(id);
  const db = await getDb();
  const rows = await db.query("DELETE FROM users WHERE id = $1::uuid AND role = 'student' RETURNING id", [id]);
  if (rows.length === 0) throw new HttpError(404, "Ученик не найден");
  return json({ ok: true });
});

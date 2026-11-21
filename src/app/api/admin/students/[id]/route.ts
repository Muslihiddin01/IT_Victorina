import { hashPassword, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import { generatePassword } from "@/lib/students";

function checkId(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Ученик не найден");
}

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

import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { cleanGroupName, getGroups } from "@/lib/groups";
import { HttpError, json, readJson, route } from "@/lib/http";

function groupId(id: string) {
  const value = Number(id);
  if (!Number.isInteger(value)) throw new HttpError(404, "Группа не найдена");
  return value;
}

// PATCH /api/admin/groups/:id { name } — переименовать
export const PATCH = route(async (req, { id }) => {
  await requireUser(req, "admin");
  const { name } = await readJson<{ name?: string }>(req);
  const db = await getDb();
  const rows = await db.query("UPDATE student_groups SET name = $2 WHERE id = $1::int RETURNING id", [
    groupId(id),
    cleanGroupName(name),
  ]);
  if (rows.length === 0) throw new HttpError(404, "Группа не найдена");
  return json({ groups: await getGroups(db) });
});

// DELETE /api/admin/groups/:id — удалить пустую группу (с учениками нельзя: сначала переведите их)
export const DELETE = route(async (req, { id }) => {
  await requireUser(req, "admin");
  const db = await getDb();
  const rows = await db.query(
    `DELETE FROM student_groups g WHERE g.id = $1::int
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.group_id = g.id AND u.role = 'student')
      RETURNING id`,
    [groupId(id)],
  );
  if (rows.length === 0) throw new HttpError(409, "В группе есть ученики: сначала переведите их в другую группу");
  return json({ groups: await getGroups(db) });
});

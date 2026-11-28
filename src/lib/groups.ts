import "server-only";

import type { Db } from "./db";
import { HttpError } from "./errors";
import type { Group } from "./types";

// Все группы с числом учеников (по порядку создания)
export async function getGroups(db: Db): Promise<Group[]> {
  const rows = await db.query<{ id: number; name: string; students: number }>(
    `SELECT g.id, g.name, count(u.id)::int AS students
       FROM student_groups g LEFT JOIN users u ON u.group_id = g.id AND u.role = 'student'
      GROUP BY g.id, g.name
      ORDER BY g.id`,
  );
  return rows.map((row) => ({ id: Number(row.id), name: row.name, students: Number(row.students) }));
}

export function cleanGroupName(name: unknown) {
  const clean = typeof name === "string" ? name.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  if (!clean) throw new HttpError(400, "Введите название группы");
  return clean;
}

// groupId из запроса: число существующей группы или null (без группы)
export async function checkGroupId(db: Db, groupId: unknown): Promise<number | null> {
  if (groupId === null || groupId === undefined) return null;
  const id = Number(groupId);
  if (!Number.isInteger(id)) throw new HttpError(400, "Группа не найдена");
  const [row] = await db.query("SELECT id FROM student_groups WHERE id = $1::int", [id]);
  if (!row) throw new HttpError(404, "Группа не найдена");
  return id;
}

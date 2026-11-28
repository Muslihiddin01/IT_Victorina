import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { cleanGroupName, getGroups } from "@/lib/groups";
import { json, readJson, route } from "@/lib/http";

// GET /api/admin/groups — группы и сколько в них учеников
export const GET = route(async (req) => {
  await requireUser(req, "admin");
  return json({ groups: await getGroups(await getDb()) });
});

// POST /api/admin/groups { name } — новая группа
export const POST = route(async (req) => {
  await requireUser(req, "admin");
  const { name } = await readJson<{ name?: string }>(req);
  const db = await getDb();
  const [row] = await db.query<{ id: number }>("INSERT INTO student_groups (name) VALUES ($1) RETURNING id", [
    cleanGroupName(name),
  ]);
  return json({ id: Number(row.id), groups: await getGroups(db) }, 201);
});

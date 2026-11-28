import { requireUser } from "@/lib/auth";
import { getDb, ms } from "@/lib/db";
import { getGroups } from "@/lib/groups";
import { json, route } from "@/lib/http";
import type { ClassJournal, ClassJournalStudent } from "@/lib/types";
import { goalAt, typingBests } from "@/lib/typing-goals";

// GET /api/admin/journal?group=ID — общий журнал группы (group=none — ученики без группы).
// Столбцы — тесты с вопросами, в которых был хоть один ученик группы; плюс лучший результат печатания.
export const GET = route(async (req) => {
  await requireUser(req, "admin");
  const db = await getDb();
  const groups = await getGroups(db);
  const param = req.nextUrl.searchParams.get("group");
  const groupId = param === "none" ? null : ((groups.find((g) => g.id === Number(param)) ?? groups[0])?.id ?? null);

  const students = await db.query<{ id: string; name: string; login: string }>(
    `SELECT id, name, login FROM users
      WHERE role = 'student' AND group_id IS NOT DISTINCT FROM $1::int
      ORDER BY name`,
    [groupId],
  );
  const ids = JSON.stringify(students.map((s) => s.id));

  const rooms = await db.query<{ id: string; title: string; code: string; date: Date; status: string }>(
    `SELECT r.id, r.title, r.code, coalesce(r.started_at, r.created_at) AS date, r.status
       FROM rooms r
      WHERE r.kind = 'quiz' AND r.status <> 'waiting'
        AND EXISTS (SELECT 1 FROM participants p
                     WHERE p.room_id = r.id AND p.user_id IN (SELECT jsonb_array_elements_text($1::text::jsonb)::uuid))
      ORDER BY date DESC`,
    [ids],
  );
  const results = await db.query<{
    user_id: string;
    room_id: string;
    score: number | null;
    total: number | null;
    submitted_at: Date | null;
  }>(
    `SELECT p.user_id, p.room_id, p.score, p.total, p.submitted_at
       FROM participants p JOIN rooms r ON r.id = p.room_id
      WHERE r.kind = 'quiz' AND r.status <> 'waiting'
        AND p.user_id IN (SELECT jsonb_array_elements_text($1::text::jsonb)::uuid)`,
    [ids],
  );

  const [{ ungrouped }] = await db.query<{ ungrouped: number }>(
    "SELECT count(*)::int AS ungrouped FROM users WHERE role = 'student' AND group_id IS NULL",
  );
  const typingGoal = await goalAt(db, null);
  const bests = await typingBests(
    db,
    students.map((s) => s.id),
    typingGoal,
  );
  const byId = new Map<string, ClassJournalStudent>(
    students.map((s) => [
      s.id,
      {
        id: s.id,
        name: s.name,
        login: s.login,
        typingBest: bests.get(s.id)?.best ?? null,
        typingPassedAt: bests.get(s.id)?.passedAt ?? null,
        results: {},
      },
    ]),
  );
  for (const row of results) {
    const student = byId.get(row.user_id);
    if (!student) continue;
    student.results[row.room_id] = {
      score: row.score === null ? null : Number(row.score),
      total: row.total === null ? null : Number(row.total),
      submitted: row.submitted_at !== null,
    };
  }

  const payload: ClassJournal = {
    groups,
    groupId,
    ungrouped: Number(ungrouped),
    typingGoal,
    rooms: rooms.map((room) => ({
      id: room.id,
      title: room.title,
      code: room.code,
      date: ms(room.date)!,
      running: room.status === "running",
    })),
    students: [...byId.values()],
  };
  return json(payload);
});

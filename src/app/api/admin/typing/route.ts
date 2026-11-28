import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { json, readJson, route } from "@/lib/http";
import { goalAt, startGoal } from "@/lib/typing-goals";

// POST /api/admin/typing { wpm } — новая норма печатания с этой минуты (старые тесты остаются со своей нормой)
export const POST = route(async (req) => {
  await requireUser(req, "admin");
  const { wpm } = await readJson<{ wpm?: number }>(req);
  const db = await getDb();
  await startGoal(db, wpm);
  return json({ typingGoal: await goalAt(db, null) }, 201);
});

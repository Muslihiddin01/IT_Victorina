import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { json, readJson, route } from "@/lib/http";
import { getTypingJournal, startGoal } from "@/lib/typing-goals";

// GET /api/admin/typing?goal=ID — журнал печатания: кто набрал норму этапа (без goal — текущий этап)
export const GET = route(async (req) => {
  await requireUser(req, "admin");
  const goal = Number(req.nextUrl.searchParams.get("goal")) || undefined;
  return json(await getTypingJournal(await getDb(), goal));
});

// POST /api/admin/typing { wpm } — начать новый этап с новой нормой
export const POST = route(async (req) => {
  await requireUser(req, "admin");
  const { wpm } = await readJson<{ wpm?: number }>(req);
  const db = await getDb();
  await startGoal(db, wpm);
  return json(await getTypingJournal(db), 201);
});

import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import type { TypingMe } from "@/lib/types";
import { countWpm, isTypingSeconds, makeWords, WORD_COUNT } from "@/lib/typing";
import { goalAt, typingBests } from "@/lib/typing-goals";

async function me(db: Awaited<ReturnType<typeof getDb>>, userId: string): Promise<TypingMe> {
  const goal = await goalAt(db, null);
  const best = (await typingBests(db, [userId], goal)).get(userId)?.best ?? null;
  return { best, goal };
}

// GET /api/typing — рекорд ученика (тренировка и тесты учителя) и норма
export const GET = route(async (req) => {
  const user = await requireUser(req);
  return json(await me(await getDb(), user.id));
});

// POST /api/typing { seed, seconds, typed, current } — попытка в тренировке.
// Слова зависят только от seed, поэтому скорость сервер считает сам — прислать «999» не выйдет.
export const POST = route(async (req) => {
  const user = await requireUser(req, "student");
  const body = await readJson<{ seed?: unknown; seconds?: unknown; typed?: unknown; current?: unknown }>(req);
  if (typeof body.seed !== "string" || body.seed.length === 0 || body.seed.length > 80) {
    throw new HttpError(400, "Неверный формат запроса");
  }
  if (!isTypingSeconds(body.seconds)) throw new HttpError(400, "Неверный формат запроса");
  const typed = Array.isArray(body.typed)
    ? body.typed.slice(0, WORD_COUNT).map((word) => String(word).slice(0, 30))
    : [];
  const current = typeof body.current === "string" ? body.current.slice(0, 30) : "";
  const seconds = body.seconds;

  const db = await getDb();
  // Попытка длится не меньше таймера: две подряд быстрее — значит, что-то не так
  const [last] = await db.query<{ ago: number }>(
    `SELECT extract(epoch FROM now() - created_at) * 1000 AS ago
       FROM typing_results WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
    [user.id],
  );
  if (last && Number(last.ago) < seconds * 1000 - 3000) throw new HttpError(429, "Слишком часто. Попробуй ещё раз");

  const wpm = Math.min(400, countWpm(makeWords(body.seed), typed, current, seconds));
  const before = await me(db, user.id);
  await db.query("INSERT INTO typing_results (user_id, wpm, seconds) VALUES ($1::uuid, $2::int, $3::int)", [
    user.id,
    wpm,
    seconds,
  ]);
  return json({ wpm, record: before.best === null || wpm > before.best, ...(await me(db, user.id)) });
});

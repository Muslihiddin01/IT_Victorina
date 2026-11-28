import { HttpError, json, readJson, route } from "@/lib/http";
import { loadParticipant } from "@/lib/participant";
import { cleanBehaviour } from "@/lib/rooms";
import { countWpm, makeWords } from "@/lib/typing";
import type { Behaviour, SubmitResult } from "@/lib/types";

type Body = {
  typed?: unknown; // печатание: законченные слова
  current?: unknown; // печатание: недопечатанное слово
  answers?: Record<string, number>;
  behaviour?: Partial<Behaviour>;
  finishedAgoMs?: number; // сколько миллисекунд назад ученик нажал «Завершить»
};

// POST /api/rooms/:id/submit — отправить ответы. Проверяем их здесь, на сервере.
export const POST = route(async (req, { id }) => {
  const { db, room, participant } = await loadParticipant(req, id);

  // Уже отправлял (например, интернет моргнул и браузер повторил запрос) — отдаём тот же результат
  if (participant.submitted_at && room.kind !== "typing") {
    return json({ score: participant.score ?? 0, total: participant.total ?? 0 } satisfies SubmitResult);
  }
  if (room.status === "waiting") throw new HttpError(409, "Тест ещё не начался");

  const body = await readJson<Body>(req);

  // Печатание: браузер присылает напечатанные слова, а скорость считаем здесь по словам комнаты
  if (room.kind === "typing") {
    if (participant.submitted_at) return json({ wpm: participant.wpm ?? 0 });
    // Учитель нажал «Завершить», пока ученик допечатывал, — даём минуту дослать результат
    if (room.status === "finished" && (room.finishedAt ?? 0) < Date.now() - 60_000) {
      throw new HttpError(409, "Тест уже завершён");
    }
    const words = makeWords(room.id);
    const typed = (Array.isArray(body.typed) ? body.typed : [])
      .slice(0, words.length)
      .map((word) => String(word).slice(0, 40));
    const current = String(body.current ?? "").slice(0, 40);
    const wpm = Math.min(400, countWpm(words, typed, current, room.typingSec ?? 60));
    await db.query(
      `UPDATE participants SET submitted_at = now(), finished_at = now(), loaded_at = coalesce(loaded_at, now()),
              wpm = $2::int, last_seen_at = now()
        WHERE id = $1::uuid AND submitted_at IS NULL`,
      [participant.id, wpm],
    );
    return json({ wpm });
  }
  const questions = await db.query<{ n: number; options: string[]; correct: number }>(
    "SELECT n, options, correct FROM room_questions WHERE room_id = $1::uuid",
    [room.id],
  );

  const answers: Record<string, number> = {};
  let score = 0;
  for (const question of questions) {
    const chosen = body.answers?.[String(question.n)];
    if (Number.isInteger(chosen) && chosen! >= 0 && chosen! < question.options.length) {
      answers[question.n] = chosen!;
      if (chosen === question.correct) score++;
    }
  }

  const b = cleanBehaviour(body.behaviour);
  const agoMs = Math.max(0, Math.min(6 * 3600_000, Math.round(Number(body.finishedAgoMs) || 0)));

  // finished_at не может быть раньше, чем ученик скачал тест (браузер мог прислать что угодно)
  await db.query(
    `UPDATE participants SET
        submitted_at = now(),
        finished_at = GREATEST(now() - make_interval(secs => ($2::int / 1000.0)::float8), loaded_at),
        answers = $3::text::jsonb,
        answered = $4::int,
        score = $5::int,
        total = $6::int,
        leaves = GREATEST(leaves, $7::int),
        away_ms = GREATEST(away_ms, $8::int),
        online_count = GREATEST(online_count, $9::int),
        online_mode = online_mode OR $10::boolean,
        last_seen_at = now()
      WHERE id = $1::uuid AND submitted_at IS NULL`,
    [
      participant.id, agoMs, JSON.stringify(answers), Object.keys(answers).length, score, questions.length,
      b.leaves, b.awayMs, b.onlineCount, b.onlineMode,
    ],
  );

  const result: SubmitResult = { score, total: questions.length };
  return json(result);
});

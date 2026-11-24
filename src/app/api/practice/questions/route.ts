import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, route } from "@/lib/http";
import { pickQuestions } from "@/lib/rooms";
import type { PracticeSet } from "@/lib/types";

// Сколько вопросов в одной тренировке
const ALL_TOPICS = 20; // «Все темы»: случайные вопросы поровну из всех уроков
const ONE_TOPIC = 30; // одна тема: все её вопросы (но не больше 30)

// GET /api/practice/questions?topic=3 или ?topic=all — вопросы вперемешку, с правильными ответами
export const GET = route(async (req) => {
  await requireUser(req);
  const db = await getDb();
  const topic = new URL(req.url).searchParams.get("topic") ?? "";

  let set: Omit<PracticeSet, "questions">;
  let topicIds: number[];
  let count: number;
  if (topic === "all") {
    set = { title: "Все темы", titleTj: "Ҳамаи мавзӯъҳо" };
    topicIds = []; // пусто — из всех тем
    count = ALL_TOPICS;
  } else {
    const id = Number(topic);
    if (!Number.isInteger(id)) throw new HttpError(404, "Тема не найдена");
    const [row] = await db.query<{ title: string; title_tj: string | null }>(
      "SELECT title, title_tj FROM topics WHERE id = $1::int",
      [id],
    );
    if (!row) throw new HttpError(404, "Тема не найдена");
    set = { title: row.title, titleTj: row.title_tj };
    topicIds = [id];
    count = ONE_TOPIC;
  }

  const picked = await pickQuestions(db, topicIds, count);
  const payload: PracticeSet = { ...set, questions: picked.map((q, i) => ({ ...q, n: i + 1 })) };
  return json(payload);
});

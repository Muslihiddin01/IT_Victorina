import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { route } from "@/lib/http";
import { getParticipants, getRoom } from "@/lib/rooms";
import { deadlineOf } from "@/lib/types";
import { buildXlsx, STYLE, type Cell } from "@/lib/xlsx";

const TZ = process.env.TIMEZONE || "Asia/Dushanbe";

function time(value: number | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value);
}

// Пороги оценок в процентах: ?g5=85&g4=70&g3=50. Неверные — берём обычные.
const DEFAULT_GRADES = { g5: 85, g4: 70, g3: 50 };
function thresholds(url: URL) {
  const read = (key: keyof typeof DEFAULT_GRADES) => {
    const value = Number(url.searchParams.get(key));
    return Number.isInteger(value) && value >= 1 && value <= 100 ? value : NaN;
  };
  const g = { g5: read("g5"), g4: read("g4"), g3: read("g3") };
  return g.g5 > g.g4 && g.g4 > g.g3 ? g : DEFAULT_GRADES;
}

// Где что лежит на листе (строки считаются с 1, как в Excel)
const HEADER_ROW = 11;
const FIRST = HEADER_ROW + 1;

// GET /api/admin/rooms/:id/export — результаты в Excel. Оценку файл считает сам по порогам вверху листа.
export const GET = route(async (req, { id }) => {
  await requireUser(req, "admin");
  const db = await getDb();
  const room = await getRoom(db, id);
  const participants = await getParticipants(db, room.id);
  const g = thresholds(new URL(req.url));

  const grade = (part: number) => (part >= g.g5 / 100 ? 5 : part >= g.g4 / 100 ? 4 : part >= g.g3 / 100 ? 3 : 2);
  const last = Math.max(FIRST, FIRST + participants.length - 1);
  const grades = `F${FIRST}:F${last}`;
  const parts = participants.map((p) => (p.score !== null && p.total ? p.score / p.total : null));
  const given = parts.filter((part): part is number => part !== null).map(grade);
  const count = (n: number) => given.filter((x) => x === n).length;
  const average = given.length ? Math.round((given.reduce((a, b) => a + b, 0) / given.length) * 100) / 100 : "";

  const date = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ }).format(room.createdAt);
  const rows: Cell[][] = [
    [{ value: `Результаты: ${room.title}`, style: STYLE.title }],
    [`Комната ${room.code} · ${date} · вопросов: ${room.questionCount}`],
    [],
    [{ value: "Пороги оценок: меняйте жёлтые ячейки — оценки пересчитаются сами", style: STYLE.bold }],
    ["«5» — от", { value: g.g5 / 100, style: STYLE.input }, "Получили «5»", { formula: `COUNTIF(${grades},5)`, cached: count(5) }],
    ["«4» — от", { value: g.g4 / 100, style: STYLE.input }, "Получили «4»", { formula: `COUNTIF(${grades},4)`, cached: count(4) }],
    ["«3» — от", { value: g.g3 / 100, style: STYLE.input }, "Получили «3»", { formula: `COUNTIF(${grades},3)`, cached: count(3) }],
    ["«2» — ниже порога «3»", null, "Получили «2»", { formula: `COUNTIF(${grades},2)`, cached: count(2) }],
    [null, null, "Средняя оценка", { formula: `IFERROR(ROUND(AVERAGE(${grades}),2),"")`, cached: average }],
    [],
    [
      "Имя", "Логин", "Баллы", "Из", "Процент", "Оценка", "Отвечено", "Закончил", "Отправил", "Опоздал",
      "Уходил со страницы (раз)", "Вне страницы (сек)", "Включал интернет (раз)", "Не выключал интернет",
    ].map((title) => ({ value: title, style: STYLE.header })),
  ];

  const deadline = deadlineOf(room.endsAt, room.finishedAt);
  participants.forEach((p, i) => {
    const r = FIRST + i;
    const part = parts[i];
    const late = deadline !== null && p.finishedAt !== null && p.finishedAt > deadline + 30_000;
    rows.push([
      p.name,
      p.login,
      p.score ?? null,
      p.total ?? null,
      // Не сдал — процента и оценки нет (пустая ячейка, а не «2»)
      { formula: `IF(AND(ISNUMBER(C${r}),D${r}>0),C${r}/D${r},"")`, cached: part ?? "", style: STYLE.percent },
      {
        formula: `IF(E${r}="","",IF(E${r}>=$B$5,5,IF(E${r}>=$B$6,4,IF(E${r}>=$B$7,3,2))))`,
        cached: part === null ? "" : grade(part),
        style: STYLE.center,
      },
      p.answered ?? null,
      time(p.finishedAt),
      time(p.submittedAt),
      late ? "да" : "",
      p.leaves,
      Math.round(p.awayMs / 1000),
      p.onlineCount,
      p.onlineMode ? "да" : "",
    ]);
  });

  const file = buildXlsx({
    name: "Результаты",
    rows,
    widths: [28, 16, 15, 9, 10, 9, 10, 11, 11, 9, 14, 12, 14, 13],
  });
  const fileDate = date.replace(/\./g, "-");
  return new Response(file as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="results-${room.code}-${fileDate}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
});

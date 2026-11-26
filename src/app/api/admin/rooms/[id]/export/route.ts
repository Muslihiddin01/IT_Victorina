import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { route } from "@/lib/http";
import { getParticipants, getRoom } from "@/lib/rooms";
import { DEFAULT_GRADES, GRADE_KEYS, gradeOf, validGrades, type Grades } from "@/lib/grades";
import { deadlineOf } from "@/lib/types";
import { buildXlsx, STYLE, type Cell } from "@/lib/xlsx";

const TZ = process.env.TIMEZONE || "Asia/Dushanbe";

function time(value: number | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value);
}

// Пороги оценок в процентах: ?g5=85&g4=70&g3=50&g2=30&g1=15. Неверные — берём обычные.
function thresholds(url: URL): Grades {
  const g = Object.fromEntries(GRADE_KEYS.map((key) => [key, Number(url.searchParams.get(key) ?? DEFAULT_GRADES[key])]));
  return validGrades(g) ? g : DEFAULT_GRADES;
}

// Где что лежит на листе (строки считаются с 1, как в Excel): пороги «5»…«1» — в B5:B9
const GRADE_ROW = 5;
const HEADER_ROW = 13;
const FIRST = HEADER_ROW + 1;

// =IF(E14="","",IF(E14>=$B$5,5,IF(E14>=$B$6,4,…,0))) — оценка по жёлтым порогам
function gradeFormula(cell: string) {
  let formula = "0";
  for (let i = GRADE_KEYS.length - 1; i >= 0; i--) formula = `IF(${cell}>=$B$${GRADE_ROW + i},${5 - i},${formula})`;
  return `IF(${cell}="","",${formula})`;
}

// GET /api/admin/rooms/:id/export — результаты в Excel. Оценку файл считает сам по порогам вверху листа.
export const GET = route(async (req, { id }) => {
  await requireUser(req, "admin");
  const db = await getDb();
  const room = await getRoom(db, id);
  const participants = await getParticipants(db, room.id);
  const g = thresholds(new URL(req.url));

  const grade = (part: number) => gradeOf(part, g);
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
    ...GRADE_KEYS.map((key, i): Cell[] => [
      `«${5 - i}» — от`,
      { value: g[key] / 100, style: STYLE.input },
      `Получили «${5 - i}»`,
      { formula: `COUNTIF(${grades},${5 - i})`, cached: count(5 - i) },
    ]),
    ["«0» — ниже порога «1»", null, "Получили «0»", { formula: `COUNTIF(${grades},0)`, cached: count(0) }],
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
      // Не сдал — процента и оценки нет (пустая ячейка, а не «0»)
      { formula: `IF(AND(ISNUMBER(C${r}),D${r}>0),C${r}/D${r},"")`, cached: part ?? "", style: STYLE.percent },
      {
        formula: gradeFormula(`E${r}`),
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

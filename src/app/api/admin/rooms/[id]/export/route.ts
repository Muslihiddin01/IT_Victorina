import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { route } from "@/lib/http";
import { getParticipants, getRoom } from "@/lib/rooms";
import { deadlineOf } from "@/lib/types";

const TZ = process.env.TIMEZONE || "Asia/Dushanbe";

function time(value: number | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value);
}

function cell(value: unknown) {
  let text = String(value ?? "");
  // Текст, который начинается с «=», «+», «-» или «@», Excel выполнил бы как формулу
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// GET /api/admin/rooms/:id/export — результаты в CSV (открывается в Excel)
export const GET = route(async (req, { id }) => {
  await requireUser(req, "admin");
  const db = await getDb();
  const room = await getRoom(db, id);
  const participants = await getParticipants(db, room.id);

  const header = [
    "Имя", "Логин", "Баллы", "Из", "Процент", "Отвечено", "Закончил", "Отправил",
    "Опоздал", "Уходил со страницы (раз)", "Вне страницы (сек)", "Включал интернет (раз)", "Не выключал интернет",
  ];
  const deadline = deadlineOf(room.endsAt, room.finishedAt);
  const lines = participants.map((p) => {
    const late = deadline !== null && p.finishedAt !== null && p.finishedAt > deadline + 30_000;
    return [
      p.name, p.login, p.score ?? "", p.total ?? "",
      p.score !== null && p.total ? Math.round((p.score / p.total) * 100) + "%" : "",
      p.answered ?? "", time(p.finishedAt), time(p.submittedAt), late ? "да" : "",
      p.leaves, Math.round(p.awayMs / 1000), p.onlineCount, p.onlineMode ? "да" : "",
    ];
  });

  // ";" и BOM в начале — чтобы русский Excel сразу открыл файл правильно
  const csv = "﻿" + [header, ...lines].map((line) => line.map(cell).join(";")).join("\r\n");
  const date = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ }).format(room.createdAt).replace(/\./g, "-");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="results-${room.code}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});

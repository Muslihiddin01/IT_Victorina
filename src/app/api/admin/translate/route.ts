import { requireUser } from "@/lib/auth";
import { HttpError, json, readJson, route } from "@/lib/http";
import { translateToTajik } from "@/lib/translate";

// POST /api/admin/translate — { texts: ["...", ...] } → { translations: ["...", ...] }
// Перевод с русского на таджикский для редактора вопросов (учитель потом проверяет и сохраняет сам).
export const POST = route(async (req) => {
  await requireUser(req, "admin");
  const body = await readJson<{ texts?: unknown }>(req);
  const texts = Array.isArray(body.texts) ? body.texts.map((text) => (typeof text === "string" ? text : "")) : [];
  if (texts.length === 0 || texts.every((text) => !text.trim())) throw new HttpError(400, "Нечего переводить");
  if (texts.length > 10) throw new HttpError(400, "Слишком много текстов за раз");
  if (texts.some((text) => text.length > 600)) throw new HttpError(400, "Текст слишком длинный для перевода");
  return json({ translations: await translateToTajik(texts) });
});

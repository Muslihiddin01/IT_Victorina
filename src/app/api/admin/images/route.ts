import { createHash } from "node:crypto";

import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";

// Браузер учителя заранее уменьшает картинку (до ~1200 px), так что обычно она весит 50–300 КБ
const MAX_BYTES = 1_500_000;

// Первые байты файла — так узнаём настоящий формат, а не тот, что написал браузер
function detectMime(bytes: Buffer) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  if (bytes.subarray(0, 6).toString("ascii").startsWith("GIF8")) return "image/gif";
  return null;
}

// POST /api/admin/images — загрузить картинку для вопроса. Тело: { data: "data:image/jpeg;base64,..." }
export const POST = route(async (req) => {
  await requireUser(req, "admin");
  const { data } = await readJson<{ data?: unknown }>(req);
  const match = typeof data === "string" ? /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=]+)$/.exec(data) : null;
  if (!match) throw new HttpError(400, "Это не картинка");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > MAX_BYTES) throw new HttpError(400, "Картинка слишком большая (больше 1,5 МБ)");
  const mime = detectMime(bytes);
  if (!mime) throw new HttpError(400, "Подойдут картинки JPG, PNG, WebP или GIF");

  const id = createHash("sha256").update(bytes).digest("hex");
  const db = await getDb();
  await db.query("INSERT INTO images (id, mime, data) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING", [
    id,
    mime,
    bytes.toString("base64"),
  ]);
  // Уборка: картинки, которые за сутки так и не попали ни в один вопрос (заменили или передумали)
  await db.query(
    `DELETE FROM images i
      WHERE i.created_at < now() - interval '1 day'
        AND NOT EXISTS (SELECT 1 FROM questions q WHERE q.image = i.id)
        AND NOT EXISTS (SELECT 1 FROM room_questions r WHERE r.image = i.id)`,
  );
  return json({ id }, 201);
});

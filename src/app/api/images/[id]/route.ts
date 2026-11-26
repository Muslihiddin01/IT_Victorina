import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/http";
import { IMAGE_ID } from "@/lib/questions";

// GET /api/images/:id — картинка вопроса.
// id — отпечаток содержимого, поэтому картинка по этому адресу никогда не меняется:
// браузер хранит её у себя «навсегда» и покажет даже без интернета (важно для теста).
export const GET = route(async (_req, { id }) => {
  if (!IMAGE_ID.test(id)) throw new HttpError(404, "Картинка не найдена");
  const db = await getDb();
  const [row] = await db.query<{ mime: string; data: string }>("SELECT mime, data FROM images WHERE id = $1", [id]);
  if (!row) throw new HttpError(404, "Картинка не найдена");
  return new Response(new Uint8Array(Buffer.from(row.data, "base64")), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

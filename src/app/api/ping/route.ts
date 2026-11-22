import { connection } from "next/server";

// GET /api/ping — крошечный ответ, чтобы проверить, есть ли настоящий интернет.
// Базу не трогаем, поэтому отвечает мгновенно.
export async function GET() {
  await connection();
  return new Response("ok", { headers: { "Cache-Control": "no-store" } });
}

import "server-only";

import { unstable_rethrow } from "next/navigation";
import { connection, NextResponse, type NextRequest } from "next/server";

import { ensureReady } from "./db";

import { HttpError } from "./errors";

export { HttpError };

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function readJson<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Неверный формат запроса");
  }
}

type Ctx = { params: Promise<Record<string, string>> };
type Handler = (req: NextRequest, params: Record<string, string>) => Promise<Response>;

// Обёртка для всех API-маршрутов: готовит базу и превращает ошибки в JSON
export function route(handler: Handler) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      await connection(); // API всегда выполняется по запросу, а не заранее при сборке
      await ensureReady();
      const params = ctx?.params ? await ctx.params : {};
      return await handler(req, params);
    } catch (error) {
      unstable_rethrow(error); // служебные сигналы Next.js пропускаем дальше
      if (error instanceof HttpError) {
        return json({ error: error.message }, error.status);
      }
      console.error(error);
      return json({ error: "Ошибка сервера. Попробуйте ещё раз." }, 500);
    }
  };
}

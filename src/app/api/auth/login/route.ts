import { normalizeLogin, startSession, verifyPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import type { Me } from "@/lib/types";

// POST /api/auth/login — вход по логину и паролю
export const POST = route(async (req) => {
  const body = await readJson<{ login?: string; password?: string }>(req);
  const login = normalizeLogin(body.login ?? "");
  const password = body.password ?? "";
  if (!login || !password) throw new HttpError(400, "Введите логин и пароль");

  const db = await getDb();
  const [user] = await db.query<Me & { password_hash: string }>(
    "SELECT id, name, login, role, password_hash FROM users WHERE login = $1",
    [login],
  );
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await new Promise((resolve) => setTimeout(resolve, 400)); // замедляем подбор паролей
    throw new HttpError(401, "Неверный логин или пароль");
  }

  const res = json({ user: { id: user.id, name: user.name, login: user.login, role: user.role } });
  await startSession(res, user.id);
  return res;
});

import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { getDb } from "./db";
import { HttpError } from "./http";
export { hashPassword, verifyPassword } from "./password";
import type { Me, Role } from "./types";

export const SESSION_COOKIE = "quiz_session";
const SESSION_DAYS = 30;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeLogin(login: string) {
  return login.trim().toLowerCase();
}

// Вход: создаём сессию и кладём её ключ в cookie
export async function startSession(res: NextResponse, userId: string) {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  // Заодно убираем просроченные сессии, чтобы таблица не росла бесконечно
  await db.query("DELETE FROM sessions WHERE expires_at < now()");
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2::uuid, now() + make_interval(days => $3::int))`,
    [tokenHash(token), userId, SESSION_DAYS],
  );
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession(req: NextRequest, res: NextResponse) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash(token)]);
  }
  res.cookies.delete(SESSION_COOKIE);
}

export async function getUser(req: NextRequest): Promise<Me | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const rows = await db.query<Me>(
    `SELECT u.id, u.name, u.login, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash(token)],
  );
  return rows[0] ?? null;
}

export async function requireUser(req: NextRequest, role?: Role): Promise<Me> {
  const user = await getUser(req);
  if (!user) throw new HttpError(401, "Нужно войти в систему");
  if (role && user.role !== role) throw new HttpError(403, "Нет доступа");
  return user;
}

import "server-only";

import { HttpError } from "./errors";
import { SCHEMA } from "./schema";
import { applyMigrations, seedIfEmpty, syncAdmin } from "./seed";

// Единый интерфейс базы данных.
// На Vercel — настоящий Postgres (Neon) по адресу из DATABASE_URL.
// На твоём компьютере — PGlite: тот же Postgres, но прямо внутри Node.js,
// ничего устанавливать не нужно, данные лежат в папке .data/
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

type Global = { __quizDb?: Promise<Db>; __quizReady?: Promise<void> };
const g = globalThis as unknown as Global;

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

async function connect(): Promise<Db> {
  const url = databaseUrl();

  if (url) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(url, {
      max: Number(process.env.DB_POOL_MAX) || 5,
      idle_timeout: 20,
      connect_timeout: 15,
      onnotice: () => {},
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrap = (s: any): Db => ({
      query: async (text, params = []) => (await s.unsafe(text, params)) as never,
      tx: (fn) => s.begin((t: unknown) => fn(wrap(t))) as never,
    });
    return wrap(sql);
  }

  // На Vercel файлы сохранять нельзя — там обязательно нужна настоящая база
  if (process.env.VERCEL) {
    throw new HttpError(503, "База данных не подключена. Vercel → проект → Storage → подключите Neon и сделайте Redeploy.");
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { mkdirSync } = await import("node:fs");
  const dir = process.env.PGLITE_DIR || "./.data/pglite";
  mkdirSync(dir, { recursive: true });
  const pg = await PGlite.create(dir);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrap = (c: any): Db => ({
    query: async (text, params = []) => (await c.query(text, params)).rows as never,
    tx: (fn) => c.transaction((t: unknown) => fn(wrap(t))) as never,
  });
  return wrap(pg);
}

export function getDb(): Promise<Db> {
  if (!g.__quizDb) {
    g.__quizDb = connect().catch((error) => {
      g.__quizDb = undefined;
      throw error;
    });
  }
  return g.__quizDb;
}

// Один раз при запуске сервера: создаём таблицы, первые вопросы и админа.
export function ensureReady(): Promise<void> {
  if (!g.__quizReady) {
    g.__quizReady = (async () => {
      const db = await getDb();
      await db.tx(async (tx) => {
        // Блокировка, чтобы два сервера не создавали таблицы одновременно
        await tx.query("SELECT pg_advisory_xact_lock(727274)");
        for (const statement of SCHEMA) await tx.query(statement);
        await seedIfEmpty(tx);
        await applyMigrations(tx);
      });
      await syncAdmin(db);
    })().catch((error) => {
      g.__quizReady = undefined;
      throw error;
    });
  }
  return g.__quizReady;
}

// Время из базы → миллисекунды (так удобно передавать в браузер)
export function ms(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value as string).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

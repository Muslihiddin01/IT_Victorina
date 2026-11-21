import { hashPassword, normalizeLogin, requireUser } from "@/lib/auth";
import { getDb, ms } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import { generatePassword, loginFromName, validLogin } from "@/lib/students";

// GET /api/admin/students — список учеников
export const GET = route(async (req) => {
  await requireUser(req, "admin");
  const db = await getDb();
  const rows = await db.query<{ id: string; name: string; login: string; created_at: Date }>(
    "SELECT id, name, login, created_at FROM users WHERE role = 'student' ORDER BY name",
  );
  return json({
    students: rows.map((row) => ({ id: row.id, name: row.name, login: row.login, createdAt: ms(row.created_at) })),
  });
});

type NewStudent = { name?: string; login?: string; password?: string };

// POST /api/admin/students — добавить одного или сразу много учеников
// В ответе пароли видны ОДИН раз: в базе хранится только их хеш.
export const POST = route(async (req) => {
  await requireUser(req, "admin");
  const body = await readJson<{ students?: NewStudent[] }>(req);
  const list = (body.students ?? []).filter((s) => s.name?.trim());
  if (list.length === 0) throw new HttpError(400, "Введите имя ученика");
  if (list.length > 200) throw new HttpError(400, "За один раз можно добавить до 200 учеников");

  const db = await getDb();
  const created = await db.tx(async (tx) => {
    const taken = new Set(
      (await tx.query<{ login: string }>("SELECT login FROM users")).map((row) => row.login),
    );
    const result: { id: string; name: string; login: string; password: string }[] = [];

    for (const student of list) {
      const name = student.name!.trim().replace(/\s+/g, " ").slice(0, 80);
      let login = normalizeLogin(student.login ?? "");
      if (login) {
        if (!validLogin(login)) {
          throw new HttpError(400, `Логин «${login}»: только латинские буквы, цифры и точка, от 3 символов`);
        }
        if (taken.has(login)) throw new HttpError(409, `Логин «${login}» уже занят`);
      } else {
        const base = loginFromName(name).slice(0, 28);
        login = base.length >= 3 ? base : `${base}.st`;
        for (let i = 2; taken.has(login); i++) login = `${base}${i}`;
      }
      const password = student.password?.trim() || generatePassword();
      if (password.length < 4) throw new HttpError(400, "Пароль должен быть не короче 4 символов");

      const [row] = await tx.query<{ id: string }>(
        "INSERT INTO users (login, name, password_hash, role) VALUES ($1, $2, $3, 'student') RETURNING id",
        [login, name, await hashPassword(password)],
      );
      taken.add(login);
      result.push({ id: row.id, name, login, password });
    }
    return result;
  });

  return json({ created }, 201);
});

"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { TrashIcon } from "@/components/icons";
import { ErrorText, Spinner } from "@/components/ui";
import { api, plural } from "@/lib/client";
import type { Student } from "@/lib/types";

type Created = { id: string; name: string; login: string; password: string };

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [created, setCreated] = useState<Created[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await api<{ students: Student[] }>("/api/admin/students");
    setStudents(data.students);
  }, []);

  useEffect(() => {
    api<{ students: Student[] }>("/api/admin/students")
      .then((data) => setStudents(data.students))
      .catch((e) => setError(e.message));
  }, []);

  async function add(list: { name: string; login?: string; password?: string }[]) {
    const data = await api<{ created: Created[] }>("/api/admin/students", {
      method: "POST",
      body: { students: list },
    });
    setCreated(data.created);
    await load();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
      <div className="space-y-6">
        <AddOne onAdd={add} />
        <AddMany onAdd={add} />
      </div>

      <section className="min-w-0">
        {created.length > 0 && <CreatedList created={created} onClose={() => setCreated([])} />}

        <h2 className="font-display text-xl font-bold">
          Ученики{students ? <span className="text-muted"> {students.length}</span> : null}
        </h2>
        <ErrorText>{error}</ErrorText>
        {!students ? (
          <Spinner className="mt-6 size-6 text-cobalt" />
        ) : students.length === 0 ? (
          <p className="mt-4 text-muted">Учеников пока нет. Добавьте их слева: по одному или списком.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border-[1.5px] border-line bg-white">
            {students.map((student) => (
              <StudentRow key={student.id} student={student} onChange={load} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AddOne({ onAdd }: { onAdd: (list: { name: string; login?: string; password?: string }[]) => Promise<void> }) {
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onAdd([{ name, login: login || undefined, password: password || undefined }]);
      setName("");
      setLogin("");
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel space-y-4 p-5">
      <h1 className="font-display text-xl font-bold">Добавить ученика</h1>
      <div>
        <label className="label" htmlFor="name">
          Имя и фамилия
        </label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="login">
            Логин
          </label>
          <input
            id="login"
            className="input"
            placeholder="сам придумаю"
            autoCapitalize="none"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Пароль
          </label>
          <input
            id="password"
            className="input"
            placeholder="6 цифр"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>
      <p className="text-sm text-muted">Пустой логин и пароль сайт придумает сам.</p>
      <ErrorText>{error}</ErrorText>
      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? <Spinner /> : null} Добавить
      </button>
    </form>
  );
}

// Строка «Имя Фамилия» или «Имя Фамилия; логин; пароль» (логин и пароль можно не писать)
function parseStudent(line: string) {
  const [name = "", login = "", password = ""] = line.split(/[;\t]/).map((part) => part.trim());
  return { name, login: login || undefined, password: password || undefined };
}

function AddMany({
  onAdd,
}: {
  onAdd: (list: { name: string; login?: string; password?: string }[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const students = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseStudent)
    .filter((student) => student.name);
  const names = students.map((student) => student.name);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onAdd(students);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel space-y-4 p-5">
      <h2 className="font-display text-lg font-bold">Добавить целый класс</h2>
      <div>
        <label className="label" htmlFor="names">
          Один ученик на строку
        </label>
        <textarea
          id="names"
          className="input min-h-36 resize-y leading-relaxed"
          placeholder={"Алиев Фаррух\nРаҳимова Зарина\nКаримов Сино"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <p className="text-sm text-muted">
        Логины и пароли сайт придумает сам и покажет их списком для печати. Свои можно указать через точку с запятой:{" "}
        <span className="whitespace-nowrap font-semibold">Алиев Фаррух; aliev; 123456</span>
      </p>
      <ErrorText>{error}</ErrorText>
      <button className="btn btn-soft w-full" disabled={busy || names.length === 0}>
        {busy ? <Spinner /> : null}
        Добавить {names.length > 0 ? `${names.length} ${plural(names.length, ["ученика", "учеников", "учеников"])}` : "список"}
      </button>
    </form>
  );
}

function CreatedList({ created, onClose }: { created: Created[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = created.map((c) => `${c.name}\tлогин: ${c.login}\tпароль: ${c.password}`).join("\n");

  function print() {
    const win = window.open("", "_blank");
    if (!win) return;
    const rows = created
      .map((c) => `<tr><td>${escape(c.name)}</td><td>${escape(c.login)}</td><td>${escape(c.password)}</td></tr>`)
      .join("");
    win.document.write(`<!doctype html><meta charset="utf-8"><title>Логины учеников</title>
      <style>body{font:16px system-ui,sans-serif;padding:24px}table{border-collapse:collapse;width:100%}
      td,th{border:1px solid #999;padding:10px 12px;text-align:left}th{background:#eef}</style>
      <h2>Логины и пароли</h2><table><tr><th>Имя</th><th>Логин</th><th>Пароль</th></tr>${rows}</table>
      <script>print()</script>`);
    win.document.close();
  }

  return (
    <div className="mb-8 rounded-2xl border-2 border-green bg-green-soft p-5">
      <h2 className="font-display text-lg font-bold text-green-edge">
        Добавлено: {created.length} {plural(created.length, ["ученик", "ученика", "учеников"])}
      </h2>
      <p className="mt-1 text-[15px]">
        Сохраните или распечатайте пароли сейчас: потом их увидеть нельзя, только выдать новый.
      </p>
      <div className="mt-4 overflow-x-auto rounded-xl bg-white">
        <table className="w-full text-left text-[15px]">
          <thead className="text-sm text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Имя</th>
              <th className="px-3 py-2 font-semibold">Логин</th>
              <th className="px-3 py-2 font-semibold">Пароль</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {created.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2 font-semibold">{c.login}</td>
                <td className="px-3 py-2 font-display font-bold tracking-wider">{c.password}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="btn btn-soft btn-sm"
          onClick={async () => {
            // Без https (например, по IP в локальной сети) буфер обмена недоступен — тогда честно не пишем «Скопировано»
            const ok = await navigator.clipboard?.writeText(text).then(
              () => true,
              () => false,
            );
            setCopied(Boolean(ok));
            if (!ok) print();
          }}
        >
          {copied ? "Скопировано" : "Скопировать"}
        </button>
        <button className="btn btn-soft btn-sm" onClick={print}>
          Распечатать
        </button>
        <button className="btn btn-soft btn-sm" onClick={onClose}>
          Готово, скрыть
        </button>
      </div>
    </div>
  );
}

function escape(text: string) {
  return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

function StudentRow({ student, onChange }: { student: Student; onChange: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"idle" | "rename" | "reset" | "delete">("idle");
  const [name, setName] = useState(student.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setMode("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  const reset = () =>
    run(async () => {
      const data = await api<{ password: string }>(`/api/admin/students/${student.id}`, {
        method: "PATCH",
        body: { resetPassword: true },
      });
      setPassword(data.password);
    });

  const remove = () =>
    run(async () => {
      await api(`/api/admin/students/${student.id}`, { method: "DELETE" });
      await onChange();
    });

  function rename(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      await api(`/api/admin/students/${student.id}`, { method: "PATCH", body: { name } });
      await onChange();
    });
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {mode === "rename" ? (
          <form onSubmit={rename} className="flex min-w-0 flex-1 flex-wrap gap-2">
            <input
              className="input !min-h-9 min-w-48 flex-1 !py-1.5"
              aria-label="Имя и фамилия"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <button className="btn btn-primary btn-sm" disabled={busy || !name.trim()}>
              Сохранить
            </button>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setMode("idle")}>
              Отмена
            </button>
          </form>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{student.name}</p>
            <p className="text-sm text-muted">{student.login}</p>
          </div>
        )}
        {password && (
          <span className="rounded-lg bg-green-soft px-3 py-1.5 text-[15px]">
            Новый пароль: <b className="font-display tracking-wider">{password}</b>
          </span>
        )}
        {mode === "reset" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px]">Старый пароль перестанет работать, ученика выкинет из аккаунта.</span>
            <button className="btn btn-soft btn-sm" onClick={() => setMode("idle")}>
              Отмена
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={reset}>
              Выдать пароль
            </button>
          </div>
        )}
        {mode === "delete" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px]">Удалить ученика? Его старые результаты останутся.</span>
            <button className="btn btn-soft btn-sm" onClick={() => setMode("idle")}>
              Отмена
            </button>
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={remove}>
              Удалить
            </button>
          </div>
        )}
        {mode === "idle" && (
          <div className="flex gap-2">
            <button
              className="btn btn-soft btn-sm"
              onClick={() => {
                setName(student.name);
                setMode("rename");
              }}
            >
              Имя
            </button>
            <button className="btn btn-soft btn-sm" onClick={() => setMode("reset")}>
              Новый пароль
            </button>
            <button className="btn btn-soft btn-sm !px-2.5" aria-label="Удалить ученика" onClick={() => setMode("delete")}>
              <TrashIcon className="size-4" />
            </button>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </li>
  );
}

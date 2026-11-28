"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CheckIcon } from "@/components/icons";
import { ErrorText, Spinner } from "@/components/ui";
import { api, plural } from "@/lib/client";
import type { TypingGoal, TypingGoalStudent, TypingJournal } from "@/lib/types";

const dateLong = (ts: number) => new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

function stageDates(goal: TypingGoal) {
  return goal.endedAt === null
    ? `с ${dateLong(goal.startedAt)}, идёт сейчас`
    : `${dateLong(goal.startedAt)} — ${dateLong(goal.endedAt)}`;
}

export function TypingJournalView() {
  const [data, setData] = useState<TypingJournal | null>(null);
  const [goalId, setGoalId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newGoal, setNewGoal] = useState<string | null>(null);

  useEffect(() => {
    api<TypingJournal>(`/api/admin/typing${goalId ? `?goal=${goalId}` : ""}`)
      .then((next) => {
        setData(next);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"));
  }, [goalId]);

  async function startStage() {
    setBusy(true);
    setError("");
    try {
      const next = await api<TypingJournal>("/api/admin/typing", {
        method: "POST",
        body: { wpm: Number(newGoal) },
      });
      setData(next);
      setGoalId(null);
      setNewGoal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <ErrorText>{error}</ErrorText> : <Spinner className="size-6 text-cobalt" />;

  const { goal, goals, students } = data;
  const current = goal.endedAt === null;
  const number = goals.length - goals.findIndex((item) => item.id === goal.id);
  const passed = students.filter((s) => s.passedAt !== null).sort((a, b) => (b.best ?? 0) - (a.best ?? 0));
  const notYet = students
    .filter((s) => s.passedAt === null)
    .sort((a, b) => (b.best ?? -1) - (a.best ?? -1) || a.name.localeCompare(b.name, "ru"));
  const part = students.length ? passed.length / students.length : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Журнал печатания</h1>
        <p className="mt-1 max-w-2xl leading-relaxed text-muted">
          Кто из учеников уже печатает не меньше нормы. Считаются тесты «Печатание», которые ты запускаешь в комнатах; у
          каждого ученика берётся лучший результат за этап.
        </p>
      </div>

      {goals.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {goals.map((item, i) => (
            <button
              key={item.id}
              className={`btn btn-sm ${item.id === goal.id ? "btn-primary" : "btn-soft"}`}
              onClick={() => setGoalId(i === 0 ? null : item.id)}
            >
              Этап {goals.length - i} · {item.wpm} сл/мин
            </button>
          ))}
        </div>
      )}

      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-muted">
              Этап {number} · {stageDates(goal)}
            </p>
            <p className="mt-1 font-display text-[28px] font-bold leading-tight">
              Норма: {goal.wpm} <span className="text-xl text-muted">слов в минуту</span>
            </p>
          </div>
          {current && newGoal === null && (
            <button className="btn btn-soft btn-sm" onClick={() => setNewGoal(String(goal.wpm + 10))}>
              Следующий этап…
            </button>
          )}
        </div>

        {newGoal !== null && (
          <div className="mt-4 rounded-2xl bg-paper p-4">
            <label className="label" htmlFor="new-goal">
              Новая норма, слов в минуту
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="new-goal"
                className="input !w-28"
                type="number"
                inputMode="numeric"
                min={5}
                max={200}
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
              />
              <button className="btn btn-primary" disabled={busy || !newGoal} onClick={startStage}>
                {busy ? <Spinner /> : null} Начать этап {goals.length + 1}
              </button>
              <button className="btn btn-soft" disabled={busy} onClick={() => setNewGoal(null)}>
                Отмена
              </button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Новый этап начнётся прямо сейчас: в нём считаются только новые тесты. Этап {number} с нормой {goal.wpm}{" "}
              останется в журнале.
            </p>
          </div>
        )}

        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-lg">
              Набрали норму: <b className="font-display text-2xl text-green-edge">{passed.length}</b>{" "}
              <span className="text-muted">
                из {students.length} {plural(students.length, ["ученика", "учеников", "учеников"])}
              </span>
            </p>
            <p className="font-display text-lg font-bold text-muted">{Math.round(part * 100)}%</p>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-paper">
            <div className="h-full rounded-full bg-green transition-all" style={{ width: `${part * 100}%` }} />
          </div>
        </div>
      </section>

      <ErrorText>{error}</ErrorText>

      <StudentTable
        title={`Набрали норму ${goal.wpm}`}
        empty="Пока никто не набрал норму."
        students={passed}
        goal={goal.wpm}
      />
      <StudentTable
        title="Ещё не набрали"
        empty={students.length ? "Норму набрали все — можно начинать следующий этап." : "Учеников пока нет."}
        students={notYet}
        goal={goal.wpm}
      />
    </div>
  );
}

function StudentTable({
  title,
  empty,
  students,
  goal,
}: {
  title: string;
  empty: string;
  students: TypingGoalStudent[];
  goal: number;
}) {
  return (
    <section>
      <h2 className="font-display text-lg font-bold">
        {title} <span className="text-muted">· {students.length}</span>
      </h2>
      {students.length === 0 ? (
        <p className="mt-2 text-muted">{empty}</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl border-[1.5px] border-line bg-white">
          <table className="w-full min-w-[520px] text-left text-[15px]">
            <thead className="border-b border-line bg-paper/60 text-sm text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Ученик</th>
                <th className="px-4 py-3 font-semibold">Лучший результат</th>
                <th className="px-4 py-3 font-semibold">Попыток</th>
                <th className="px-4 py-3 font-semibold">Итог</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {students.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/student?id=${s.id}`} className="font-semibold hover:text-cobalt">
                      {s.name}
                    </Link>
                    <p className="text-sm text-muted">{s.login}</p>
                  </td>
                  <td className="px-4 py-3">
                    {s.best === null ? (
                      <span className="text-muted">не печатал</span>
                    ) : (
                      <span>
                        <b className="font-display text-xl">{s.best}</b> <span className="text-muted">слов/мин</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{s.attempts}</td>
                  <td className="px-4 py-3">
                    {s.passedAt !== null ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-green-edge">
                        <CheckIcon className="size-4" /> Прошёл {dateLong(s.passedAt)}
                      </span>
                    ) : s.best === null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className="text-[#7a4f00]">не хватает {goal - s.best}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { GradeBadge, GradesEditor, useGrades } from "@/components/grades";
import { GroupTabs, loadGroup } from "@/components/group-tabs";
import { CheckIcon } from "@/components/icons";
import { ErrorText, Spinner } from "@/components/ui";
import { api, plural } from "@/lib/client";
import { GRADE_KEYS, gradeOf, type Grades } from "@/lib/grades";
import type { ClassJournal, ClassJournalRoom, ClassJournalStudent } from "@/lib/types";

const dateShort = (ts: number) => new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
const dateLong = (ts: number) => new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

export function ClassJournalView() {
  const [data, setData] = useState<ClassJournal | null>(null);
  const [error, setError] = useState("");
  const [showGrades, setShowGrades] = useState(false);
  const gradesState = useGrades();
  const { grades } = gradesState;

  const load = useCallback(async (group: number | null | undefined) => {
    const param = group === undefined ? "" : `?group=${group === null ? "none" : group}`;
    try {
      setData(await api<ClassJournal>(`/api/admin/journal${param}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- первая загрузка журнала
    load(loadGroup());
  }, [load]);

  if (!data) return error ? <ErrorText>{error}</ErrorText> : <Spinner className="size-6 text-cobalt" />;

  const { students, rooms, typingGoal } = data;
  const passed = students.filter((s) => s.typingBest !== null && s.typingBest >= typingGoal).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Журнал</h1>
          <p className="mt-1 text-muted">Оценки за тесты и лучший результат печатания каждого ученика.</p>
        </div>
        <div className="relative">
          <button className="btn btn-soft btn-sm" aria-expanded={showGrades} onClick={() => setShowGrades(!showGrades)}>
            Оценки: {GRADE_KEYS.map((key) => grades[key]).join("/")}%
          </button>
          {showGrades && (
            <div className="absolute right-0 z-30 mt-2">
              <GradesEditor state={gradesState} note="Те же пороги, что у кнопки Excel в комнате." />
            </div>
          )}
        </div>
      </div>

      <GroupTabs groups={data.groups} value={data.groupId} onChange={load} ungrouped={data.ungrouped}>
        <Link href="/admin/students" className="text-[15px] font-semibold text-cobalt">
          Группы и ученики →
        </Link>
      </GroupTabs>

      <TypingGoalPanel goal={typingGoal} passed={passed} total={students.length} onSaved={() => load(data.groupId)} />

      <ErrorText>{error}</ErrorText>

      {students.length === 0 ? (
        <p className="text-muted">В этой группе пока нет учеников.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border-[1.5px] border-line bg-white">
          <table className="w-full border-separate border-spacing-0 text-left text-[15px]">
            <thead className="text-sm text-muted">
              <tr>
                <th className="sticky left-0 z-10 min-w-44 border-b border-line bg-paper px-4 py-3 font-semibold">
                  Ученик
                </th>
                <th className="border-b border-line bg-paper px-3 py-3 font-semibold">
                  Печатание
                  <span className="block font-normal">норма {typingGoal}</span>
                </th>
                <th className="border-b border-line bg-paper px-3 py-3 font-semibold">
                  Средняя
                  <span className="block font-normal">оценка</span>
                </th>
                {rooms.map((room) => (
                  <RoomHead key={room.id} room={room} />
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <StudentLine key={student.id} student={student} rooms={rooms} goal={typingGoal} grades={grades} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {students.length > 0 && rooms.length === 0 && (
        <p className="text-muted">Тестов с вопросами у этой группы ещё не было — здесь появятся их оценки.</p>
      )}
    </div>
  );
}

function RoomHead({ room }: { room: ClassJournalRoom }) {
  return (
    <th className="border-b border-l border-line bg-paper px-3 py-3 align-top font-semibold">
      <Link
        href={`/admin/room?id=${room.id}`}
        className="line-clamp-2 min-w-24 max-w-36 text-ink hover:text-cobalt"
        title={room.title}
      >
        {room.title}
      </Link>
      <span className="block font-normal">
        {dateShort(room.date)}
        {room.running && <span className="text-cobalt"> · идёт</span>}
      </span>
    </th>
  );
}

function StudentLine({
  student,
  rooms,
  goal,
  grades,
}: {
  student: ClassJournalStudent;
  rooms: ClassJournalRoom[];
  goal: number;
  grades: Grades;
}) {
  const marks = rooms
    .map((room) => student.results[room.id])
    .filter((r) => r?.submitted && r.score !== null && r.total)
    .map((r) => gradeOf(r.score! / r.total!, grades));
  const average = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null;
  const best = student.typingBest;
  const ok = best !== null && best >= goal;

  return (
    <tr className="group">
      <td className="sticky left-0 z-10 border-b border-line bg-white px-4 py-2.5 group-last:border-b-0">
        <Link href={`/admin/student?id=${student.id}`} className="font-semibold hover:text-cobalt">
          {student.name}
        </Link>
        <p className="text-sm text-muted">{student.login}</p>
      </td>
      <td
        className={`border-b border-line px-3 py-2.5 group-last:border-b-0 ${ok ? "bg-green-soft" : ""}`}
        title={
          ok && student.typingPassedAt
            ? `Набрал норму ${dateLong(student.typingPassedAt)}`
            : best === null
              ? "Ещё не печатал"
              : `До нормы не хватает ${goal - best}`
        }
      >
        {best === null ? (
          <span className="text-muted">—</span>
        ) : (
          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${ok ? "text-green-edge" : ""}`}>
            {ok && <CheckIcon className="size-4" />}
            <b className="font-display text-lg">{best}</b>
            <span className={ok ? "" : "text-muted"}>сл/мин</span>
          </span>
        )}
      </td>
      <td className="border-b border-line px-3 py-2.5 font-display text-lg font-bold group-last:border-b-0">
        {average === null ? (
          <span className="font-sans text-base font-normal text-muted">—</span>
        ) : (
          average.toFixed(1).replace(".", ",")
        )}
      </td>
      {rooms.map((room) => {
        const result = student.results[room.id];
        return (
          <td key={room.id} className="border-b border-l border-line px-3 py-2.5 group-last:border-b-0">
            {!result ? (
              <span className="text-line">—</span>
            ) : result.submitted && result.score !== null && result.total ? (
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <GradeBadge grade={gradeOf(result.score / result.total, grades)} />
                <span className="text-sm text-muted">{Math.round((result.score / result.total) * 100)}%</span>
              </span>
            ) : room.running ? (
              <span className="text-sm text-cobalt">решает</span>
            ) : (
              <span className="text-sm text-red-edge">не сдал</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// Норма печатания: сколько набрали и «Изменить» (например, через месяц — 40)
function TypingGoalPanel({
  goal,
  passed,
  total,
  onSaved,
}: {
  goal: number;
  passed: number;
  total: number;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/typing", { method: "POST", body: { wpm: Number(value) } });
      await onSaved();
      setValue(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel flex flex-wrap items-center gap-x-6 gap-y-3 p-4 sm:px-5">
      <p className="text-lg">
        Норма печатания: <b className="font-display">{goal}</b> <span className="text-muted">слов в минуту</span>
      </p>
      <p className="text-lg">
        Набрали: <b className="font-display text-green-edge">{passed}</b>{" "}
        <span className="text-muted">
          из {total} {plural(total, ["ученика", "учеников", "учеников"])}
        </span>
      </p>
      {value === null ? (
        <button className="btn btn-soft btn-sm sm:ml-auto" onClick={() => setValue(String(goal + 10))}>
          Изменить норму
        </button>
      ) : (
        <form onSubmit={save} className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <input
            className="input !min-h-9 !w-24 !py-1.5"
            aria-label="Новая норма, слов в минуту"
            type="number"
            inputMode="numeric"
            min={5}
            max={200}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <button className="btn btn-primary btn-sm" disabled={busy || !value}>
            {busy ? <Spinner /> : null} Сохранить
          </button>
          <button type="button" className="btn btn-soft btn-sm" onClick={() => setValue(null)}>
            Отмена
          </button>
        </form>
      )}
      {error && (
        <div className="w-full">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </section>
  );
}

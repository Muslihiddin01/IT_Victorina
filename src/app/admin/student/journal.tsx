"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { GradeBadge, GradesEditor, useGrades } from "@/components/grades";
import { LeaveIcon, WifiIcon } from "@/components/icons";
import { ErrorText, Spinner } from "@/components/ui";
import { api, plural } from "@/lib/client";
import { GRADE_KEYS, gradeOf, type Grades } from "@/lib/grades";
import type { JournalTest, StudentJournal } from "@/lib/types";

const dateShort = (ts: number) => new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
const dateLong = (ts: number) =>
  new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

type Point = JournalTest & { part: number; grade: number };

export function Journal() {
  const id = useSearchParams().get("id") ?? "";
  const [data, setData] = useState<StudentJournal | null>(null);
  const [error, setError] = useState("");
  const [showGrades, setShowGrades] = useState(false);
  const gradesState = useGrades();
  const { grades } = gradesState;

  useEffect(() => {
    api<StudentJournal>(`/api/admin/students/${id}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"));
  }, [id]);

  const back = (
    <Link href="/admin/students" className="text-[15px] font-semibold text-cobalt">
      ← Все ученики
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-4">
        {back}
        <ErrorText>{error}</ErrorText>
      </div>
    );
  }
  if (!data) return <Spinner className="size-6 text-cobalt" />;

  const points: Point[] = data.tests
    .filter((test) => test.submitted && test.score !== null && test.total)
    .map((test) => {
      const part = test.score! / test.total!;
      return { ...test, part, grade: gradeOf(part, grades) };
    });
  const average = points.length ? points.reduce((sum, p) => sum + p.part, 0) / points.length : null;
  const averageGrade = points.length ? points.reduce((sum, p) => sum + p.grade, 0) / points.length : null;
  // Рост: последние тесты против первых (до 3 с каждой стороны, чтобы один случайный тест не решал всё)
  const span = Math.min(3, Math.floor(points.length / 2));
  const mean = (list: Point[]) => list.reduce((sum, p) => sum + p.part, 0) / list.length;
  const growth = span >= 1 ? Math.round((mean(points.slice(-span)) - mean(points.slice(0, span))) * 100) : null;
  const missed = data.tests.filter((test) => !test.submitted && !test.running).length;

  return (
    <div className="space-y-6">
      <div>
        {back}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">{data.student.name}</h1>
            <p className="text-muted">
              {data.student.login} · журнал успеваемости
            </p>
          </div>
          <div className="relative">
            <button className="btn btn-soft btn-sm" aria-expanded={showGrades} onClick={() => setShowGrades(!showGrades)}>
              Оценки: {GRADE_KEYS.map((key) => grades[key]).join("/")}%
            </button>
            {showGrades && (
              <div className="absolute right-0 z-20 mt-2">
                <GradesEditor state={gradesState} note="Те же пороги, что у кнопки Excel в комнате." />
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Сдано тестов" value={String(points.length)} hint={missed ? `пропустил: ${missed}` : undefined} />
        <Stat label="Средний результат" value={average === null ? "—" : `${Math.round(average * 100)}%`} />
        <Stat
          label="Средняя оценка"
          value={averageGrade === null ? "—" : averageGrade.toFixed(1).replace(".", ",")}
        />
        <Stat
          label="Рост"
          value={growth === null ? "—" : `${growth > 0 ? "+" : growth < 0 ? "−" : ""}${Math.abs(growth)}%`}
          hint={
            growth === null
              ? "нужно хотя бы 2 теста"
              : span === 1
                ? "последний тест против первого"
                : `последние ${span} против первых ${span}`
          }
          tone={growth === null ? undefined : growth > 0 ? "up" : growth < 0 ? "down" : undefined}
        />
      </section>

      <section className="panel p-4 sm:p-5">
        <h2 className="font-display text-lg font-bold">Результаты по порядку</h2>
        <p className="text-sm text-muted">Процент правильных ответов в каждом тесте. Пунктир — пороги оценок.</p>
        {points.length === 0 ? (
          <p className="mt-6 text-muted">Ученик ещё не сдал ни одного теста.</p>
        ) : (
          <Chart points={points} grades={grades} />
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-bold">Все тесты</h2>
        {data.tests.length === 0 ? (
          <p className="mt-3 text-muted">Ученик пока не заходил ни в одну комнату.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border-[1.5px] border-line bg-white">
            <table className="w-full min-w-[640px] text-left text-[15px]">
              <thead className="border-b border-line bg-paper/60 text-sm text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Дата</th>
                  <th className="px-4 py-3 font-semibold">Тест</th>
                  <th className="px-4 py-3 font-semibold">Оценка и баллы</th>
                  <th className="px-4 py-3 font-semibold">Нарушения</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...data.tests].reverse().map((test) => (
                  <TestRow key={test.roomId} test={test} grades={grades} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "up" | "down" }) {
  const color = tone === "up" ? "text-green-edge" : tone === "down" ? "text-red-edge" : "text-cobalt";
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-[0_3px_0_var(--color-line)]">
      <p className="text-sm text-muted">{label}</p>
      <p className={`font-display text-2xl font-bold ${color}`}>{value}</p>
      {hint && <p className="text-[13px] text-muted">{hint}</p>}
    </div>
  );
}

function TestRow({ test, grades }: { test: JournalTest; grades: Grades }) {
  const done = test.submitted && test.score !== null && test.total;
  const flags: string[] = [];
  if (test.onlineMode) flags.push("решал с интернетом");
  if (test.onlineCount > 0) flags.push(`включал интернет: ${test.onlineCount}`);
  return (
    <tr>
      <td className="whitespace-nowrap px-4 py-3 text-muted">{dateLong(test.date)}</td>
      <td className="px-4 py-3">
        <Link href={`/admin/room?id=${test.roomId}`} className="font-semibold text-ink hover:text-cobalt">
          {test.title}
        </Link>
        <span className="block text-sm text-muted">Комната {test.code}</span>
      </td>
      <td className="px-4 py-3">
        {test.kind === "typing" ? (
          test.wpm !== null ? (
            <span>
              <b className="font-display text-lg">{test.wpm}</b> <span className="text-muted">слов/мин (печатание)</span>
            </span>
          ) : (
            <span className="text-muted">{test.running ? "Печатание ещё идёт" : "Не сдал"}</span>
          )
        ) : done ? (
          <span className="inline-flex items-center gap-3">
            <GradeBadge grade={gradeOf(test.score! / test.total!, grades)} />
            <span>
              <b className="font-display text-lg">{test.score}</b>
              <span className="text-muted">
                /{test.total}, {Math.round((test.score! / test.total!) * 100)}%
              </span>
            </span>
          </span>
        ) : (
          <span className="text-muted">{test.running ? "Тест ещё идёт" : "Не сдал"}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {flags.map((flag) => (
            <span key={flag} className="inline-flex items-center gap-1.5 rounded-full bg-red-soft px-2.5 py-1 text-[13px] font-semibold text-red-edge">
              <WifiIcon className="size-4" /> {flag}
            </span>
          ))}
          {test.leaves > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sun-soft px-2.5 py-1 text-[13px] font-semibold text-[#7a4f00]">
              <LeaveIcon className="size-4" /> уходил: {test.leaves} {plural(test.leaves, ["раз", "раза", "раз"])}
            </span>
          )}
          {flags.length === 0 && test.leaves === 0 && <span className="text-muted">Нет</span>}
        </div>
      </td>
    </tr>
  );
}

// График роста: процент в каждом тесте по порядку. Одна линия, пороги оценок пунктиром.
const HEIGHT = 240;
const PAD = { top: 14, right: 40, bottom: 30, left: 44 };

function Chart({ points, grades }: { points: Point[]; grades: Grades }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const inner = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? inner / 2 : (inner * i) / (points.length - 1));
  const y = (part: number) => PAD.top + plotH * (1 - part);
  // Подписи дат: не чаще, чем раз в 70 px
  const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(inner / 70))));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.part).toFixed(1)}`).join(" ");

  function onMove(clientX: number) {
    const rect = box.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  }

  const active = hover !== null ? points[hover] : null;

  return (
    <div
      ref={box}
      className="relative mt-4 select-none"
      style={{ height: HEIGHT }}
      onMouseMove={(e) => onMove(e.clientX)}
      onMouseLeave={() => setHover(null)}
      onTouchStart={(e) => onMove(e.touches[0].clientX)}
      onTouchMove={(e) => onMove(e.touches[0].clientX)}
    >
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label="График результатов ученика по тестам">
          {/* Сетка 0 / 50 / 100 % */}
          {[0, 0.5, 1].map((part) => (
            <g key={part}>
              <line x1={PAD.left} x2={PAD.left + inner} y1={y(part)} y2={y(part)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(part)} dy="0.35em" textAnchor="end" className="fill-muted text-[12px] tabular-nums">
                {part * 100}%
              </text>
            </g>
          ))}
          {/* Пороги оценок */}
          {GRADE_KEYS.map((key, i) => (
            <g key={key}>
              <line
                x1={PAD.left}
                x2={PAD.left + inner}
                y1={y(grades[key] / 100)}
                y2={y(grades[key] / 100)}
                stroke="var(--color-key-edge)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text x={PAD.left + inner + 8} y={y(grades[key] / 100)} dy="0.35em" className="fill-muted font-display text-[11px] font-bold">
                «{5 - i}»
              </text>
            </g>
          ))}
          {/* Перекрестие под курсором */}
          {active && (
            <line x1={x(hover!)} x2={x(hover!)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-muted)" strokeWidth={1} opacity={0.4} />
          )}
          <path d={line} fill="none" stroke="var(--color-cobalt)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <circle
              key={p.roomId}
              cx={x(i)}
              cy={y(p.part)}
              r={hover === i ? 6 : 4.5}
              fill="var(--color-cobalt)"
              stroke="#fff"
              strokeWidth={2}
            />
          ))}
          {points.map((p, i) =>
            i % every === 0 || i === points.length - 1 ? (
              <text
                key={p.roomId}
                x={x(i)}
                y={HEIGHT - 8}
                textAnchor={points.length === 1 ? "middle" : i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                className="fill-muted text-[12px]"
              >
                {dateShort(p.date)}
              </text>
            ) : null,
          )}
        </svg>
      )}
      {active && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-xl border-[1.5px] border-line bg-white px-3 py-2 text-sm shadow-[0_4px_0_var(--color-line)]"
          style={{
            left: Math.min(Math.max(0, x(hover!) - 112), Math.max(0, width - 224)),
            top: y(active.part) > HEIGHT / 2 ? PAD.top : y(active.part) + 14,
          }}
        >
          <p className="font-semibold leading-snug">{active.title}</p>
          <p className="text-muted">{dateLong(active.date)}</p>
          <p className="mt-1 flex items-center gap-2">
            <GradeBadge grade={active.grade} className="!size-6 !text-sm" />
            <span>
              <b>{active.score}</b> из {active.total} · {Math.round(active.part * 100)}%
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

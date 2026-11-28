"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { CheckIcon, DownloadIcon, LeaveIcon, PlusIcon, TrashIcon, UsersIcon, WifiIcon } from "@/components/icons";
import { GradeBadge, GradesEditor, useGrades } from "@/components/grades";
import { QrCode } from "@/components/qr-code";
import { QuestionImage } from "@/components/question-image";
import { ErrorText, Keycaps, Spinner } from "@/components/ui";
import { GRADE_KEYS, gradeOf } from "@/lib/grades";
import { api, formatClock, formatSeconds, formatTimer, plural } from "@/lib/client";
import { deadlineOf, type Participant, type RoomDetail, type RoomQuestion } from "@/lib/types";

const LETTERS = ["А", "Б", "В", "Г", "Д", "Е"];

export function RoomView() {
  const id = useSearchParams().get("id") ?? "";
  // key: при переходе в другую комнату (например, «Такая же комната») всё состояние начинается заново
  return <RoomScreen key={id} id={id} />;
}

function RoomScreen({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<RoomDetail | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"finish" | "delete" | null>(null);
  const gradesState = useGrades();

  const load = useCallback(async () => {
    try {
      const detail = await api<RoomDetail>(`/api/admin/rooms/${id}`);
      setData(detail);
      setOffset(detail.serverNow - Date.now());
      // Без этого первые полсекунды таймер показывал огромное число, а строки мигали жёлтым
      setNow(Date.now());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    }
  }, [id]);

  // Обновляем комнату каждые 2 секунды — так учитель видит всё почти сразу
  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = setInterval(load, 2000);
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  // Вопросы игры (с правильными ответами) скачиваем один раз, когда тест начался
  const [questions, setQuestions] = useState<RoomQuestion[] | null>(null);
  const started = data !== null && data.room.status !== "waiting" && data.room.kind !== "typing";
  useEffect(() => {
    if (!started || questions) return;
    api<{ questions: RoomQuestion[] }>(`/api/admin/rooms/${id}/questions`)
      .then((result) => setQuestions(result.questions))
      .catch((e) => setError(e instanceof Error ? e.message : "Не удалось загрузить вопросы"));
  }, [started, questions, id]);

  const [openId, setOpenId] = useState<string | null>(null); // чьи ответы раскрыты

  async function act(action: "start" | "finish" | "extend", minutes?: number) {
    setBusy(true);
    try {
      await api(`/api/admin/rooms/${id}`, {
        method: "PATCH",
        body: { action, minutes },
      });
      setConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/admin/rooms/${id}`, { method: "DELETE" });
      router.push("/admin");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setBusy(false);
    }
  }

  if (!data) {
    return error ? <ErrorText>{error}</ErrorText> : <Spinner className="size-6 text-cobalt" />;
  }

  const { room, participants, typingGoal } = data;
  const serverNow = now + offset;
  const remaining = room.endsAt ? room.endsAt - serverNow : 0;
  const submitted = participants.filter((p) => p.submittedAt);
  const loaded = participants.filter((p) => p.loadedAt);
  const average = submitted.length
    ? Math.round((submitted.reduce((sum, p) => sum + (p.score ?? 0) / (p.total || 1), 0) / submitted.length) * 100)
    : null;
  const typing = room.kind === "typing";
  const speeds = submitted.map((p) => p.wpm ?? 0);
  const reachedGoal = typingGoal === null ? 0 : speeds.filter((wpm) => wpm >= typingGoal).length;
  const host = typeof window !== "undefined" ? window.location.host : "";
  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/join?code=${room.code}` : "";

  // Такая же комната: те же темы, время и число вопросов, но новые вопросы и новый код
  async function duplicate() {
    setBusy(true);
    try {
      const copy = await api<{ id: string }>("/api/admin/rooms", {
        method: "POST",
        body: {
          kind: room.kind,
          typingSec: room.typingSec,
          title: room.title,
          durationMin: room.durationMin,
          questionCount: room.questionCount,
          topicIds: room.topicIds,
        },
      });
      router.push(`/admin/room?id=${copy.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin" className="text-[15px] font-semibold text-muted hover:text-ink">
          Все комнаты
        </Link>
        <span className="text-line">/</span>
        <h1 className="font-display text-xl font-bold">{room.title}</h1>
      </div>

      <ErrorText>{error}</ErrorText>

      {room.status === "waiting" && (
        <section className="overflow-hidden rounded-[28px] bg-cobalt p-6 text-white sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-8">
            <div>
              <p className="text-lg text-white/80">Код комнаты</p>
              <Keycaps value={room.code} className="mt-4 text-[56px] sm:text-[88px]" />
            </div>
            {joinUrl && (
              <div className="text-center">
                <QrCode
                  text={joinUrl}
                  label={`QR-код для входа в комнату ${room.code}`}
                  className="size-44 sm:size-52"
                />
                <p className="mt-2 text-[15px] text-white/80">Наведите камеру телефона</p>
              </div>
            )}
          </div>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-white/90">
            Ученикам: откройте <b className="text-white">{host}</b>, войдите под своим логином и введите этот код — или
            отсканируйте QR-код.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button className="btn btn-white text-lg" disabled={busy} onClick={() => act("start")}>
              {busy ? <Spinner /> : null} {typing ? "Начать печатание" : "Начать тест"}
            </button>
            <span className="text-white/85">
              {typing ? (
                <>Печатание на скорость: {room.typingSec} секунд, английские слова</>
              ) : (
                <>
                  {room.questionCount} {plural(room.questionCount, ["вопрос", "вопроса", "вопросов"])},{" "}
                  {room.durationMin} {plural(room.durationMin, ["минута", "минуты", "минут"])}
                </>
              )}
            </span>
          </div>
        </section>
      )}

      {room.status === "running" && typing && (
        <section className="flex flex-wrap items-center gap-x-10 gap-y-5 rounded-[28px] bg-white p-6 shadow-[0_4px_0_var(--color-line)]">
          <div>
            <p className="text-muted">Печатают · {room.typingSec} секунд</p>
            <p className="font-display text-[44px] font-bold tabular-nums leading-tight">
              {submitted.length}
              <span className="text-2xl text-muted"> / {participants.length} закончили</span>
            </p>
          </div>
          <div>
            <p className="text-muted">Код для опоздавших</p>
            <Keycaps value={room.code} className="mt-1 text-[22px]" />
          </div>
          <div className="ml-auto flex flex-wrap gap-3">
            {confirm === "finish" ? (
              <>
                <span className="self-center font-semibold">Завершить для всех?</span>
                <button className="btn btn-soft" onClick={() => setConfirm(null)}>
                  Отмена
                </button>
                <button className="btn btn-primary" disabled={busy} onClick={() => act("finish")}>
                  Завершить
                </button>
              </>
            ) : (
              <button className="btn btn-primary" onClick={() => setConfirm("finish")}>
                Завершить
              </button>
            )}
          </div>
          <p className="w-full text-sm text-muted">
            У каждого ученика таймер запускается с его первой буквы. Когда все закончат, нажмите «Завершить».
          </p>
        </section>
      )}

      {room.status === "running" && !typing && (
        <section className="flex flex-wrap items-center gap-x-10 gap-y-5 rounded-[28px] bg-white p-6 shadow-[0_4px_0_var(--color-line)]">
          <div>
            <p className="text-muted">Осталось</p>
            <p
              className={`font-display text-[44px] font-bold tabular-nums leading-tight ${remaining < 60_000 ? "text-red" : "text-ink"}`}
            >
              {remaining > 0 ? formatTimer(remaining) : "0:00"}
            </p>
          </div>
          {remaining > 0 && (
            <div>
              <p className="text-muted">Код для опоздавших</p>
              <Keycaps value={room.code} className="mt-1 text-[22px]" />
            </div>
          )}
          <div className="ml-auto flex flex-wrap gap-3">
            {confirm !== "finish" && (
              <>
                <button className="btn btn-soft" disabled={busy} onClick={() => act("extend", 1)}>
                  +1 мин
                </button>
                <button className="btn btn-soft" disabled={busy} onClick={() => act("extend", 5)}>
                  +5 мин
                </button>
              </>
            )}
            {confirm === "finish" ? (
              <>
                <span className="self-center font-semibold">Завершить для всех?</span>
                <button className="btn btn-soft" onClick={() => setConfirm(null)}>
                  Отмена
                </button>
                <button className="btn btn-primary" disabled={busy} onClick={() => act("finish")}>
                  Завершить
                </button>
              </>
            ) : (
              <button className="btn btn-primary" onClick={() => setConfirm("finish")}>
                Завершить тест
              </button>
            )}
          </div>
          {remaining <= 0 && (
            <p className="w-full rounded-xl bg-sun-soft px-4 py-3 text-[15px] text-[#7a4f00]">
              Время вышло. Ученики, которые решали без интернета, отправят ответы, когда включат его. Потом нажмите
              «Завершить тест» — тогда ученики увидят разбор ошибок.
            </p>
          )}
          <p className="w-full text-sm text-muted">
            Продление сразу видят ученики с интернетом. Ученики без интернета узнают о нём, когда включат интернет: если
            у них время уже вышло, тест откроется снова, ответы сохранятся.
          </p>
        </section>
      )}

      {room.status === "finished" && (
        <section className="rounded-[28px] bg-white p-6 shadow-[0_4px_0_var(--color-line)]">
          <p className="font-display text-lg font-bold">Тест завершён в {formatClock(room.finishedAt)}</p>
          {typing ? (
            <p className="mt-1 leading-relaxed text-muted">
              Результаты печатания — в таблице ниже, самые быстрые сверху. Кто уже набрал норму за этап — в{" "}
              <Link href="/admin/typing" className="font-semibold text-cobalt">
                журнале печатания
              </Link>
              .
            </p>
          ) : (
            <p className="mt-1 leading-relaxed text-muted">
              Ученики уже видят разбор ошибок. Кто решал без интернета, ещё может отправить ответы: они появятся в
              таблице с отметкой «позже времени», если ученик закончил решать после завершения.
            </p>
          )}
        </section>
      )}

      {typing ? (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Закончили" value={`${submitted.length} из ${participants.length}`} />
          <Stat label={`Набрали норму ${typingGoal ?? "—"}`} value={submitted.length ? reachedGoal : "—"} />
          <Stat
            label="Средняя скорость"
            value={speeds.length ? `${Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)} сл/мин` : "—"}
          />
          <Stat label="Лучшая" value={speeds.length ? `${Math.max(...speeds)} сл/мин` : "—"} />
        </section>
      ) : (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="В комнате" value={participants.length} />
          <Stat label="Скачали тест" value={loaded.length} />
          <Stat label="Сдали" value={submitted.length} />
          <Stat label="Средний результат" value={average === null ? "—" : `${average}%`} />
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Ученики</h2>
          <div className="flex flex-wrap gap-2">
            {room.status !== "waiting" && (
              <button className="btn btn-soft btn-sm" disabled={busy} onClick={duplicate}>
                <PlusIcon className="size-4" /> Такая же комната
              </button>
            )}
            {typing ? (
              <a className="btn btn-soft btn-sm" href={`/api/admin/rooms/${room.id}/export`} download>
                <DownloadIcon className="size-4" /> Скачать результаты (Excel)
              </a>
            ) : (
              <ExportButton roomId={room.id} gradesState={gradesState} />
            )}
            {confirm === "delete" ? (
              <>
                <button className="btn btn-soft btn-sm" onClick={() => setConfirm(null)}>
                  Отмена
                </button>
                <button className="btn btn-danger btn-sm" disabled={busy} onClick={remove}>
                  Удалить навсегда
                </button>
              </>
            ) : (
              <button className="btn btn-danger btn-sm" onClick={() => setConfirm("delete")}>
                <TrashIcon className="size-4" /> Удалить комнату
              </button>
            )}
          </div>
        </div>

        {participants.length === 0 ? (
          <p className="mt-4 flex items-center gap-2 text-muted">
            <UsersIcon /> Пока никто не вошёл. Список обновляется сам.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border-[1.5px] border-line bg-white">
            <table className="w-full min-w-[720px] text-left text-[15px]">
              <thead className="border-b border-line bg-paper/60 text-sm text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Ученик</th>
                  <th className="px-4 py-3 font-semibold">Статус</th>
                  <th className="px-4 py-3 font-semibold">{typing ? "Слов в минуту" : "Оценка и баллы"}</th>
                  <th className="px-4 py-3 font-semibold">Нарушения</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {participants.map((p) => (
                  <Row
                    key={p.id}
                    p={p}
                    roomStatus={room.status}
                    deadline={deadlineOf(room.endsAt, room.finishedAt)}
                    serverNow={serverNow}
                    questions={questions}
                    open={openId === p.id}
                    grade={p.score !== null && p.total ? gradeOf(p.score / p.total, gradesState.grades) : null}
                    typing={typing}
                    typingGoal={typingGoal}
                    onToggle={() => setOpenId(openId === p.id ? null : p.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {questions && submitted.length > 0 && <QuestionStats questions={questions} submitted={submitted} />}
    </div>
  );
}

// Сколько учеников ответили на каждый вопрос правильно. Самые трудные — сверху.
function QuestionStats({ questions, submitted }: { questions: RoomQuestion[]; submitted: Participant[] }) {
  const stats = questions
    .map((question) => {
      const picks = question.options.map(() => 0);
      let none = 0;
      for (const p of submitted) {
        const chosen = p.answers?.[String(question.n)];
        if (chosen === undefined || chosen === null || !(chosen in picks)) none++;
        else picks[chosen]++;
      }
      const right = picks[question.correct] ?? 0;
      return { question, picks, none, right, part: right / submitted.length };
    })
    .sort((a, b) => a.part - b.part || a.question.n - b.question.n);

  return (
    <section>
      <h2 className="font-display text-lg font-bold">Вопросы</h2>
      <p className="mt-1 text-[15px] text-muted">
        Сколько учеников ответили правильно (из {submitted.length}{" "}
        {plural(submitted.length, ["сдавшего", "сдавших", "сдавших"])}). Сверху — самые трудные: их стоит разобрать с
        классом. Нажмите на вопрос, чтобы увидеть, что выбирали.
      </p>
      <ol className="mt-4 space-y-2">
        {stats.map(({ question, picks, none, right, part }) => {
          const percent = Math.round(part * 100);
          const tone = part >= 0.7 ? "bg-green" : part >= 0.4 ? "bg-sun" : "bg-red";
          return (
            <li key={question.n} className="rounded-2xl border-[1.5px] border-line bg-white">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-muted">{question.topic}</span>
                    <span className="block font-semibold leading-snug">{question.text}</span>
                  </span>
                  <span className="flex w-36 flex-none items-center gap-2">
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                      <span className={`block h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
                    </span>
                    <span className="w-16 text-right font-display text-sm font-bold tabular-nums">
                      {right}/{submitted.length}
                    </span>
                  </span>
                </summary>
                <ul className="space-y-1 border-t border-line px-4 py-3">
                  {question.image && (
                    <li className="pb-2">
                      <QuestionImage id={question.image} className="!max-h-48" />
                    </li>
                  )}
                  {question.options.map((option, index) => (
                    <li
                      key={index}
                      className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[15px] ${
                        index === question.correct ? "bg-green-soft font-semibold text-green-edge" : ""
                      }`}
                    >
                      {index === question.correct ? (
                        <CheckIcon className="mt-0.5 size-4 flex-none" />
                      ) : (
                        <span className="w-4 flex-none text-muted">{LETTERS[index]}</span>
                      )}
                      <span className="flex-1">{option}</span>
                      <span className="tabular-nums text-muted">{picks[index]}</span>
                    </li>
                  ))}
                  {none > 0 && (
                    <li className="flex gap-2 px-2.5 py-1.5 text-[15px] text-muted">
                      <span className="w-4 flex-none" />
                      <span className="flex-1">Без ответа</span>
                      <span className="tabular-nums">{none}</span>
                    </li>
                  )}
                  {question.explanation && (
                    <li className="px-2.5 pt-1.5 text-sm leading-relaxed text-muted">
                      Пояснение: {question.explanation}
                    </li>
                  )}
                </ul>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// Разбор одного ученика: что выбрал в каждом вопросе
function Answers({ p, questions }: { p: Participant; questions: RoomQuestion[] }) {
  return (
    <ol className="grid gap-2 lg:grid-cols-2">
      {questions.map((question) => {
        const chosen = p.answers?.[String(question.n)];
        const answered = chosen !== undefined && chosen !== null;
        const ok = answered && chosen === question.correct;
        return (
          <li
            key={question.n}
            className={`rounded-xl border-2 bg-white px-3.5 py-2.5 ${ok ? "border-green-soft" : "border-red-soft"}`}
          >
            <p className="font-semibold leading-snug">
              {question.n}. {question.text}
            </p>
            <QuestionImage id={question.image} className="mt-1.5 !max-h-32" />
            <p className={`mt-1 text-[15px] ${ok ? "text-green-edge" : "text-red-edge"}`}>
              {answered ? `${ok ? "Верно" : "Ответ"}: ${question.options[chosen] ?? "—"}` : "Нет ответа"}
            </p>
            {!ok && <p className="text-[15px] text-green-edge">Правильно: {question.options[question.correct]}</p>}
            {question.explanation && <p className="mt-1 text-sm leading-relaxed text-muted">{question.explanation}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-[0_3px_0_var(--color-line)]">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-display text-2xl font-bold text-cobalt">{value}</p>
    </div>
  );
}

function Row({
  p,
  roomStatus,
  deadline,
  serverNow,
  questions,
  open,
  onToggle,
  grade,
  typing,
  typingGoal,
}: {
  p: Participant;
  roomStatus: RoomDetail["room"]["status"];
  deadline: number | null;
  serverNow: number;
  questions: RoomQuestion[] | null;
  open: boolean;
  onToggle: () => void;
  grade: number | null;
  typing: boolean;
  typingGoal: number | null;
}) {
  const canOpen = Boolean(p.submittedAt && questions);
  const fresh = p.lastEventAt !== null && serverNow - p.lastEventAt < 15_000 && !p.submittedAt;
  const late = deadline !== null && p.finishedAt !== null && p.finishedAt > deadline + 30_000;
  const connected = serverNow - p.lastSeenAt < 8_000;

  let status: ReactNode;
  if (p.submittedAt) {
    status = (
      <span className="inline-flex items-center gap-1.5 font-semibold text-green-edge">
        <CheckIcon className="size-4" /> Сдал в {formatClock(p.finishedAt)}
        {late && <span className="font-normal text-red-edge">, позже времени</span>}
      </span>
    );
  } else if (typing && roomStatus !== "waiting") {
    status =
      roomStatus === "finished" ? (
        <span className="text-muted">Не сдал</span>
      ) : (
        <span className="inline-flex items-center gap-2 font-semibold text-cobalt">
          <span className={`size-2 rounded-full ${connected ? "bg-green" : "bg-line"}`} />
          {connected ? "Печатает" : "Отошёл"}
        </span>
      );
  } else if (p.loadedAt) {
    status =
      roomStatus === "finished" ? (
        <span className="font-semibold text-red-edge">Ещё не отправил ответы</span>
      ) : (
        <span className="font-semibold text-cobalt">Решает</span>
      );
  } else if (roomStatus === "waiting") {
    status = (
      <span className="inline-flex items-center gap-2">
        <span className={`size-2 rounded-full ${connected ? "bg-green" : "bg-line"}`} />
        {connected ? "В комнате" : "Отошёл"}
      </span>
    );
  } else {
    status = <span className="text-muted">Не скачал тест</span>;
  }

  const flags: ReactNode[] = [];
  if (p.onlineMode) {
    flags.push(
      <Flag key="mode" tone="red" icon={<WifiIcon className="size-4" />}>
        Решал с интернетом
      </Flag>,
    );
  }
  if (p.onlineCount > 0) {
    flags.push(
      <Flag key="online" tone="red" icon={<WifiIcon className="size-4" />}>
        Включал интернет: {p.onlineCount}
      </Flag>,
    );
  }
  if (p.leaves > 0) {
    flags.push(
      <Flag key="leave" tone="sun" icon={<LeaveIcon className="size-4" />}>
        Уходил: {p.leaves} {plural(p.leaves, ["раз", "раза", "раз"])}, {formatSeconds(p.awayMs)}
      </Flag>,
    );
  }

  return (
    <>
      <tr className={fresh ? "bg-sun-soft" : open ? "bg-paper/60" : undefined}>
        <td className="px-4 py-3">
          <p className="font-semibold">{p.name}</p>
          <p className="text-sm text-muted">{p.login}</p>
        </td>
        <td className="px-4 py-3">{status}</td>
        <td className="px-4 py-3">
          {typing ? (
            p.wpm !== null ? (
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  <b className="font-display text-xl">{p.wpm}</b> <span className="text-muted">слов/мин</span>
                </span>
                {typingGoal !== null && p.wpm >= typingGoal && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-soft px-2.5 py-1 text-sm font-semibold text-green-edge">
                    <CheckIcon className="size-3.5" /> норма
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted">—</span>
            )
          ) : p.score !== null && p.total ? (
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              {grade !== null && <GradeBadge grade={grade} />}
              <span>
                <b className="font-display text-lg">{p.score}</b>
                <span className="text-muted">
                  /{p.total}, {Math.round((p.score / p.total) * 100)}%
                </span>
              </span>
              {canOpen && (
                <button className="btn btn-soft btn-sm" aria-expanded={open} onClick={onToggle}>
                  {open ? "Скрыть" : "Ответы"}
                </button>
              )}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          {flags.length ? (
            <div className="flex flex-wrap gap-1.5">{flags}</div>
          ) : (
            <span className="text-muted">Нет</span>
          )}
        </td>
      </tr>
      {open && canOpen && (
        <tr className="bg-paper/60">
          <td colSpan={4} className="px-4 pb-4 pt-1">
            <Answers p={p} questions={questions!} />
          </td>
        </tr>
      )}
    </>
  );
}

function Flag({ tone, icon, children }: { tone: "red" | "sun"; icon: ReactNode; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold ${
        tone === "red" ? "bg-red-soft text-red-edge" : "bg-sun-soft text-[#7a4f00]"
      }`}
    >
      {icon}
      {children}
    </span>
  );
}

// Кнопка Excel и пороги оценок. Пороги запоминаются в этом браузере;
// в самом файле их тоже можно поменять — оценки пересчитаются.
function ExportButton({ roomId, gradesState }: { roomId: string; gradesState: ReturnType<typeof useGrades> }) {
  const [open, setOpen] = useState(false);
  const { grades } = gradesState;
  const href = `/api/admin/rooms/${roomId}/export?${new URLSearchParams(
    GRADE_KEYS.map((key) => [key, String(grades[key])]),
  )}`;

  return (
    <div className="relative">
      <div className="flex">
        <a className="btn btn-soft btn-sm rounded-r-none" href={href} download>
          <DownloadIcon className="size-4" /> Скачать результаты (Excel)
        </a>
        <button
          className="btn btn-soft btn-sm rounded-l-none border-l border-line !px-3"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          Оценки: {GRADE_KEYS.map((key) => grades[key]).join("/")}%
        </button>
      </div>
      {open && (
        <div className="absolute right-0 z-20 mt-2">
          <GradesEditor
            state={gradesState}
            note="В файле пороги стоят в жёлтых ячейках: их можно поменять прямо в Excel — оценки пересчитаются."
          />
        </div>
      )}
    </div>
  );
}

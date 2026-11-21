"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { CheckIcon, ClockIcon, LeaveIcon, WifiIcon, WifiOffIcon } from "@/components/icons";
import { ErrorText, FullScreenLoader, Logo, Spinner } from "@/components/ui";
import { api, ApiError, formatTimer, plural } from "@/lib/client";
import {
  clearCurrent,
  getCurrent,
  loadSaved,
  persist,
  shuffled,
  type Saved,
} from "@/lib/test-storage";
import type { ResultPayload, RoomState, SubmitResult, TestPayload } from "@/lib/types";

const LETTERS = ["А", "Б", "В", "Г", "Д", "Е"];

// Есть ли сейчас интернет (браузер сообщает об этом событиями online/offline)
function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

// Текущее время, обновляется каждые intervalMs (0 — пока страница не загрузилась)
function useNow(intervalMs: number) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

export function TestRunner() {
  const [saved, setSaved] = useState<Saved | null>(null);
  const savedRef = useRef<Saved | null>(null);
  const online = useOnline();
  const now = useNow(500);

  const [lobby, setLobby] = useState<RoomState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ kind: "leave" | "online"; text: string } | null>(null);

  // Любое изменение состояния сразу сохраняем в localStorage
  const update = useCallback((change: (state: Saved) => Saved) => {
    const previous = savedRef.current;
    if (!previous) return;
    const next = change(previous);
    savedRef.current = next;
    persist(next);
    setSaved(next);
  }, []);

  // 1. Открыли страницу: достаём сохранённый тест
  useEffect(() => {
    const current = getCurrent();
    if (!current) {
      window.location.replace("/join");
      return;
    }
    const state = loadSaved(current);
    savedRef.current = state;
    // localStorage есть только в браузере, поэтому читаем его после первой отрисовки
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(state);
  }, []);

  const phase = saved?.phase;
  const roomId = saved?.roomId;

  // 2. Ждём, пока учитель нажмёт «Начать тест» (спрашиваем сервер каждые 2 секунды)
  useEffect(() => {
    if (phase !== "lobby" || !roomId) return;
    let stopped = false;
    let busy = false;

    const tick = async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        const state = await api<RoomState>(`/api/rooms/${roomId}`);
        if (stopped) return;
        setLobby(state);
        setError("");
        const { status } = state.room;
        if (state.me.submitted) {
          update((s) => ({ ...s, phase: "submitted", result: { score: state.me.score ?? 0, total: state.me.total ?? 0 } }));
        } else if (status === "finished") {
          update((s) => ({ ...s, phase: "closed" }));
        } else if (status === "running") {
          // Тест начался — скачиваем все вопросы сразу
          const test = await api<TestPayload>(`/api/rooms/${roomId}/test`);
          if (stopped) return;
          update((s) => ({
            ...s,
            phase: "ready",
            title: test.title,
            test: { endsAt: test.endsAt, offset: test.serverNow - Date.now(), questions: test.questions },
            order: shuffled(test.questions.length),
            optionOrder: Object.fromEntries(test.questions.map((q) => [q.n, shuffled(q.options.length)])),
            current: 0,
          }));
        }
      } catch (e) {
        if (stopped) return;
        if (e instanceof ApiError && e.status === 401) window.location.replace("/login");
        else if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
          clearCurrent();
          window.location.replace("/join");
        } else setError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        busy = false;
      }
    };

    tick();
    const id = setInterval(tick, 2000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [phase, roomId, update]);

  // 3. Время вышло — тест завершается сам
  const remaining = saved?.test && now > 0 ? saved.test.endsAt - (now + saved.test.offset) : null;
  useEffect(() => {
    if ((phase === "ready" || phase === "running") && remaining !== null && remaining <= 0) {
      update((s) => ({ ...s, phase: "finishing", finishedAt: Date.now() }));
    }
  }, [phase, remaining, update]);

  // 4. Во время теста следим: уходил ли ученик со страницы и включал ли интернет
  useEffect(() => {
    if (phase !== "running") return;
    let awaySince: number | null = null;
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;

    const show = (kind: "leave" | "online", text: string) => {
      setNotice({ kind, text });
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => setNotice(null), 6000);
    };

    // Если интернет есть — сразу сообщаем учителю
    const report = () => {
      const s = savedRef.current;
      if (!s || !navigator.onLine) return;
      fetch(`/api/rooms/${s.roomId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ behaviour: s.behaviour }),
        keepalive: true,
      }).catch(() => {});
    };

    const check = () => {
      const away = document.visibilityState === "hidden" || !document.hasFocus();
      if (away && awaySince === null) {
        awaySince = Date.now();
      } else if (!away && awaySince !== null) {
        const duration = Date.now() - awaySince;
        awaySince = null;
        if (duration >= 1500) {
          update((s) => ({
            ...s,
            behaviour: { ...s.behaviour, leaves: s.behaviour.leaves + 1, awayMs: s.behaviour.awayMs + duration },
          }));
          show("leave", "Ты уходил со страницы теста — учитель это увидит.");
          report();
        }
      }
    };

    const onOnline = () => {
      if (!savedRef.current?.behaviour.onlineMode) {
        update((s) => ({ ...s, behaviour: { ...s.behaviour, onlineCount: s.behaviour.onlineCount + 1 } }));
        show("online", "Интернет включился — учитель это видит. Выключи его, пока решаешь тест.");
      }
      report();
    };

    window.addEventListener("blur", check);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("blur", check);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", onOnline);
      clearTimeout(noticeTimer);
    };
  }, [phase, update]);

  // 5. Тест закончен — отправляем ответы, как только появится интернет
  const [submitError, setSubmitError] = useState("");
  const [sending, setSending] = useState(false);
  const submit = useCallback(async () => {
    const s = savedRef.current;
    if (!s || s.phase !== "finishing" || !navigator.onLine) return;
    setSending(true);
    try {
      const result = await api<SubmitResult>(`/api/rooms/${s.roomId}/submit`, {
        method: "POST",
        body: {
          answers: s.answers,
          behaviour: s.behaviour,
          finishedAgoMs: Date.now() - (s.finishedAt ?? Date.now()),
        },
      });
      update((state) => ({ ...state, phase: "submitted", result }));
      setSubmitError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setSubmitError("Нужно войти заново. Ответы сохранены на этом устройстве — после входа открой тест снова.");
      } else {
        setSubmitError(e instanceof Error ? e.message : "Не получилось отправить");
      }
    } finally {
      setSending(false);
    }
  }, [update]);

  useEffect(() => {
    if (phase !== "finishing") return;
    const first = setTimeout(submit, 0); // первая попытка — сразу
    const id = setInterval(submit, 4000); // потом — каждые 4 секунды
    window.addEventListener("online", submit);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      window.removeEventListener("online", submit);
    };
  }, [phase, submit]);

  if (!saved) return <FullScreenLoader />;

  const leave = () => {
    clearCurrent();
    window.location.assign("/join");
  };

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-8 pt-4 sm:px-6">
      {saved.phase === "lobby" && <Lobby saved={saved} state={lobby} error={error} onLeave={leave} />}

      {saved.phase === "ready" && (
        <Ready
          saved={saved}
          online={online}
          remaining={remaining ?? 0}
          onStart={(withInternet) =>
            update((s) => ({
              ...s,
              phase: "running",
              startedAt: Date.now(),
              behaviour: { ...s.behaviour, onlineMode: withInternet },
            }))
          }
        />
      )}

      {saved.phase === "running" && (
        <Questions
          saved={saved}
          online={online}
          remaining={remaining ?? 0}
          notice={notice}
          onAnswer={(n, option) => update((s) => ({ ...s, answers: { ...s.answers, [n]: option } }))}
          onGo={(index) => update((s) => ({ ...s, current: index }))}
          onFinish={() => update((s) => ({ ...s, phase: "finishing", finishedAt: Date.now() }))}
        />
      )}

      {saved.phase === "finishing" && (
        <Finishing saved={saved} online={online} sending={sending} error={submitError} onSend={submit} />
      )}

      {saved.phase === "submitted" && <Result saved={saved} online={online} onLeave={leave} />}

      {saved.phase === "closed" && (
        <Centered>
          <h1 className="font-display text-2xl font-bold">Тест уже завершён</h1>
          <p className="mt-3 text-lg text-muted">Учитель закончил этот тест раньше, чем ты успел его скачать.</p>
          <button className="btn btn-primary mt-8 w-full" onClick={leave}>
            Ввести другой код
          </button>
        </Centered>
      )}
    </main>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col justify-center py-6">{children}</div>;
}

function OnlineChip({ online, warn = false }: { online: boolean; warn?: boolean }) {
  if (online) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
          warn ? "bg-red-soft text-red-edge" : "bg-sun-soft text-[#8a5a00]"
        }`}
      >
        <WifiIcon className="size-4" /> Интернет включён
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-soft px-3 py-1.5 text-sm font-semibold text-green-edge">
      <WifiOffIcon className="size-4" /> Интернет выключен
    </span>
  );
}

function Timer({ remaining }: { remaining: number }) {
  const urgent = remaining < 60_000;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-[15px] font-bold tabular-nums ${
        urgent ? "bg-red text-white" : "bg-white text-ink shadow-[0_2px_0_var(--color-line)]"
      }`}
      aria-label="Осталось времени"
    >
      <ClockIcon className="size-4" />
      {formatTimer(remaining)}
    </span>
  );
}

function Lobby({
  saved,
  state,
  error,
  onLeave,
}: {
  saved: Saved;
  state: RoomState | null;
  error: string;
  onLeave: () => void;
}) {
  return (
    <>
      <header className="flex items-center justify-between">
        <Logo />
        <button className="text-[15px] font-semibold text-muted hover:text-ink" onClick={onLeave}>
          Выйти из комнаты
        </button>
      </header>
      <Centered>
        <div className="flex gap-3 text-[34px]" aria-hidden>
          {["?", "?", "?"].map((sign, index) => (
            <span
              key={index}
              className="keycap animate-key-bob size-[1.7em] !bg-cobalt !text-white !shadow-[0_0.12em_0_var(--color-cobalt-edge)]"
              style={{ animationDelay: `${index * 0.18}s` }}
            >
              {sign}
            </span>
          ))}
        </div>
        <p className="mt-8 text-lg text-muted">{saved.name}, ты в комнате</p>
        <h1 className="mt-1 font-display text-[26px] font-bold leading-tight">{state?.room.title ?? saved.title}</h1>
        <p className="mt-5 text-lg leading-relaxed">
          Ждём, когда учитель начнёт тест. Не закрывай эту страницу и пока не выключай интернет.
        </p>
        {state && (
          <dl className="mt-6 grid grid-cols-3 gap-2 text-center">
            <Stat value={state.room.questionCount} label={plural(state.room.questionCount, ["вопрос", "вопроса", "вопросов"])} />
            <Stat value={state.room.durationMin} label={plural(state.room.durationMin, ["минута", "минуты", "минут"])} />
            <Stat value={state.joinedCount} label={plural(state.joinedCount, ["ученик", "ученика", "учеников"]) + " здесь"} />
          </dl>
        )}
        <div className="mt-6">
          <ErrorText>{error}</ErrorText>
        </div>
      </Centered>
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-white px-2 py-3 shadow-[0_3px_0_var(--color-line)]">
      <dt className="sr-only">{label}</dt>
      <dd className="font-display text-2xl font-bold text-cobalt">{value}</dd>
      <dd className="mt-0.5 text-sm text-muted">{label}</dd>
    </div>
  );
}

function Ready({
  saved,
  online,
  remaining,
  onStart,
}: {
  saved: Saved;
  online: boolean;
  remaining: number;
  onStart: (withInternet: boolean) => void;
}) {
  const [withInternet, setWithInternet] = useState(false);
  const count = saved.test?.questions.length ?? 0;
  return (
    <>
      <header className="flex items-center justify-between">
        <Timer remaining={remaining} />
        <OnlineChip online={online} />
      </header>
      <Centered>
        <span className="grid size-14 place-items-center rounded-2xl bg-green text-white shadow-[0_4px_0_var(--color-green-edge)]">
          <CheckIcon className="size-8" />
        </span>
        <h1 className="mt-6 font-display text-[26px] font-bold leading-tight">Тест загружен</h1>
        <p className="mt-3 text-lg leading-relaxed">
          {count} {plural(count, ["вопрос", "вопроса", "вопросов"])} уже на твоём устройстве. Теперь{" "}
          <b>выключи интернет</b>: Wi-Fi и мобильные данные. Тест будет работать без него.
        </p>
        <p className="mt-3 leading-relaxed text-muted">
          Если во время теста интернет включится или ты уйдёшь со страницы, учитель это увидит. Время уже идёт.
        </p>

        <div className="mt-7">
          <button className="btn btn-primary w-full text-lg" disabled={online} onClick={() => onStart(false)}>
            Начать тест
          </button>
          {online && (
            <p className="mt-3 text-center text-[15px] text-muted">Кнопка заработает, когда интернет выключится</p>
          )}
        </div>

        {online && (
          <div className="mt-8 border-t border-line pt-5">
            {!withInternet ? (
              <button className="text-[15px] font-semibold text-muted underline underline-offset-4" onClick={() => setWithInternet(true)}>
                Не получается выключить интернет
              </button>
            ) : (
              <div>
                <p className="leading-relaxed">
                  Можно начать и с интернетом, но учитель увидит отметку «решал с интернетом».
                </p>
                <button className="btn btn-soft mt-3 w-full" onClick={() => onStart(true)}>
                  Начать с включённым интернетом
                </button>
              </div>
            )}
          </div>
        )}
      </Centered>
    </>
  );
}

function Questions({
  saved,
  online,
  remaining,
  notice,
  onAnswer,
  onGo,
  onFinish,
}: {
  saved: Saved;
  online: boolean;
  remaining: number;
  notice: { kind: "leave" | "online"; text: string } | null;
  onAnswer: (n: number, option: number) => void;
  onGo: (index: number) => void;
  onFinish: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const questions = saved.test!.questions;
  const total = questions.length;
  const index = Math.min(saved.current, total - 1);
  const question = questions[saved.order[index]];
  const optionOrder = saved.optionOrder[question.n] ?? question.options.map((_, i) => i);
  const answeredCount = Object.keys(saved.answers).length;
  const chosen = saved.answers[question.n];

  return (
    <>
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 bg-paper/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <Timer remaining={remaining} />
        <OnlineChip online={online} warn={!saved.behaviour.onlineMode} />
      </header>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-cobalt transition-all" style={{ width: `${(answeredCount / total) * 100}%` }} />
      </div>

      {notice && (
        <p role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-sun-soft px-3.5 py-2.5 text-[15px] font-medium text-[#7a4f00]">
          {notice.kind === "online" ? (
            <WifiIcon className="mt-0.5 size-4 flex-none" />
          ) : (
            <LeaveIcon className="mt-0.5 size-4 flex-none" />
          )}{" "}
          {notice.text}
        </p>
      )}

      <section className="mt-5 flex-1">
        <p className="text-[15px] font-semibold text-muted">
          Вопрос {index + 1} из {total}
        </p>
        <h1 className="mt-2 text-[22px] font-semibold leading-snug">{question.text}</h1>

        <div className="mt-5 space-y-3">
          {optionOrder.map((optionIndex, position) => (
            <button
              key={optionIndex}
              className="option"
              aria-pressed={chosen === optionIndex}
              onClick={() => onAnswer(question.n, optionIndex)}
            >
              <span className="option-letter">{LETTERS[position]}</span>
              <span className="text-[17px] leading-snug">{question.options[optionIndex]}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button className="btn btn-soft" disabled={index === 0} onClick={() => onGo(index - 1)}>
            Назад
          </button>
          {index < total - 1 ? (
            <button className="btn btn-primary" onClick={() => onGo(index + 1)}>
              Далее
            </button>
          ) : (
            <button className="btn btn-green" onClick={() => setConfirming(true)}>
              Завершить
            </button>
          )}
        </div>
      </section>

      <nav className="mt-8" aria-label="Все вопросы">
        <p className="mb-2 text-sm font-semibold text-muted">
          Отвечено {answeredCount} из {total}
        </p>
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
          {saved.order.map((questionIndex, position) => {
            const done = saved.answers[questions[questionIndex].n] !== undefined;
            const active = position === index;
            return (
              <button
                key={position}
                onClick={() => onGo(position)}
                aria-current={active ? "step" : undefined}
                aria-label={`Вопрос ${position + 1}${done ? ", есть ответ" : ""}`}
                className={`h-9 rounded-lg font-display text-[13px] font-bold transition ${
                  done
                    ? "bg-cobalt text-white shadow-[0_3px_0_var(--color-cobalt-edge)]"
                    : "bg-white text-muted shadow-[0_3px_0_var(--color-line)]"
                } ${active ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : ""}`}
              >
                {position + 1}
              </button>
            );
          })}
        </div>
        {!confirming ? (
          <button className="btn btn-soft mt-6 w-full" onClick={() => setConfirming(true)}>
            Завершить тест
          </button>
        ) : (
          <div className="panel mt-6 p-4">
            <p className="text-[17px] font-semibold">
              {answeredCount < total
                ? `Ты ответил на ${answeredCount} из ${total}. Точно завершить?`
                : "Все ответы готовы. Завершить тест?"}
            </p>
            <p className="mt-1 text-muted">После этого ответы изменить нельзя.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button className="btn btn-soft" onClick={() => setConfirming(false)}>
                Вернуться
              </button>
              <button className="btn btn-green" onClick={onFinish}>
                Завершить
              </button>
            </div>
          </div>
        )}
      </nav>
    </>
  );
}

function Finishing({
  saved,
  online,
  sending,
  error,
  onSend,
}: {
  saved: Saved;
  online: boolean;
  sending: boolean;
  error: string;
  onSend: () => void;
}) {
  const answered = Object.keys(saved.answers).length;
  return (
    <Centered>
      <h1 className="font-display text-[26px] font-bold leading-tight">Тест завершён</h1>
      <p className="mt-3 text-lg leading-relaxed">
        Ответы сохранены на этом устройстве ({answered} из {saved.test?.questions.length ?? 0}).{" "}
        {online ? "Отправляем их учителю…" : <><b>Включи интернет</b>, чтобы отправить их учителю.</>}
      </p>
      <div className="mt-6">
        <OnlineChip online={online} />
      </div>
      <button className="btn btn-primary mt-8 w-full text-lg" disabled={!online || sending} onClick={onSend}>
        {sending ? <Spinner /> : null}
        {sending ? "Отправляем…" : "Отправить ответы"}
      </button>
      <div className="mt-4">
        <ErrorText>{online ? error : ""}</ErrorText>
      </div>
      <p className="mt-6 text-[15px] text-muted">
        Не закрывай страницу. Если закроешь — ответы не пропадут, просто открой тест снова.
      </p>
    </Centered>
  );
}

function verdict(part: number) {
  if (part === 1) return "Идеально! Все ответы верные.";
  if (part >= 0.8) return "Отлично! Почти всё верно.";
  if (part >= 0.6) return "Хорошо! Есть что повторить.";
  if (part >= 0.4) return "Неплохо, но темы стоит повторить.";
  return "Не сдавайся: повтори уроки и попробуй снова.";
}

function Result({ saved, online, onLeave }: { saved: Saved; online: boolean; onLeave: () => void }) {
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const score = saved.result?.score ?? 0;
  const total = saved.result?.total ?? 0;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await api<ResultPayload>(`/api/rooms/${saved.roomId}/result`));
    } catch {
      // без интернета разбор просто не покажем
    } finally {
      setLoading(false);
    }
  }, [saved.roomId]);

  // Как только есть интернет — узнаём, открыт ли уже разбор ошибок
  useEffect(() => {
    if (!online) return;
    api<ResultPayload>(`/api/rooms/${saved.roomId}/result`)
      .then(setResult)
      .catch(() => {});
  }, [online, saved.roomId]);

  return (
    <div className="py-6">
      <header className="flex items-center justify-between">
        <Logo />
        <button className="text-[15px] font-semibold text-muted hover:text-ink" onClick={onLeave}>
          Выйти
        </button>
      </header>

      <section className="mt-10">
        <p className="text-lg text-muted">Твой результат</p>
        <p className="mt-2 font-display text-[64px] font-bold leading-none text-cobalt">
          {score}
          <span className="text-[32px] text-muted"> из {total}</span>
        </p>
        <p className="mt-4 text-xl font-semibold">{verdict(total ? score / total : 0)}</p>
        <p className="mt-2 text-muted">Результат уже у учителя.</p>
      </section>

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="font-display text-lg font-bold">Разбор ошибок</h2>
        {result?.review ? (
          <ol className="mt-4 space-y-3">
            {result.review.map((item, index) => {
              const ok = item.chosen === item.correct;
              return (
                <li key={item.n} className={`rounded-2xl border-2 bg-white p-4 ${ok ? "border-green-soft" : "border-red-soft"}`}>
                  <p className="text-sm font-semibold text-muted">
                    {index + 1}. {item.topic}
                  </p>
                  <p className="mt-1 font-semibold leading-snug">{item.text}</p>
                  <p className={`mt-2 text-[15px] ${ok ? "text-green-edge" : "text-red-edge"}`}>
                    {item.chosen === null ? "Нет ответа" : `Твой ответ: ${item.options[item.chosen]}`}
                  </p>
                  {!ok && <p className="text-[15px] text-green-edge">Правильно: {item.options[item.correct]}</p>}
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="mt-3">
            <p className="leading-relaxed text-muted">
              Разбор появится, когда учитель завершит тест для всех: так никто не сможет подсказать ответы остальным.
            </p>
            <button className="btn btn-soft mt-4" disabled={!online || loading} onClick={load}>
              {loading ? <Spinner /> : null} Проверить разбор
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

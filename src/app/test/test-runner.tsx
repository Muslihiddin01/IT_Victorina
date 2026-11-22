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

type Notice = { kind: "leave" | "online" | "time"; text: string };

// Есть ли сейчас НАСТОЯЩИЙ интернет.
// Одного navigator.onLine мало: на Windows он говорит «онлайн», если подключён хоть какой-то
// сетевой адаптер (например, виртуальная сеть WSL). Поэтому раз в 3 секунды стучимся на свой сервер.
function useConnectivity(enabled: boolean, onBecameOnline: () => void) {
  const [online, setOnline] = useState(true);
  const last = useRef<boolean | null>(null);
  const callback = useRef(onBecameOnline);
  useEffect(() => {
    callback.current = onBecameOnline;
  });

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let busy = false;

    const check = async () => {
      if (busy || stopped) return;
      busy = true;
      let next = false;
      if (navigator.onLine) {
        try {
          const response = await fetch(`/api/ping?t=${Date.now()}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(4000),
          });
          next = response.ok;
        } catch {
          next = false;
        }
      }
      busy = false;
      if (stopped) return;
      const previous = last.current;
      last.current = next;
      setOnline(next);
      if (previous === false && next) callback.current(); // интернет только что появился
    };

    const first = setTimeout(check, 0);
    const id = setInterval(check, 3000);
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(id);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
    };
  }, [enabled]);

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
  const now = useNow(500);

  const [lobby, setLobby] = useState<RoomState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

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

  // Подсказка вверху экрана на 6 секунд
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showNotice = useCallback((kind: Notice["kind"], text: string) => {
    setNotice({ kind, text });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  }, []);

  // Сообщаем учителю о нарушении (получится, только если интернет есть)
  const report = useCallback(() => {
    const s = savedRef.current;
    if (!s) return;
    fetch(`/api/rooms/${s.roomId}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ behaviour: s.behaviour }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  // Интернет появился во время теста — это нарушение
  const online = useConnectivity(phase !== undefined && phase !== "lobby" && phase !== "closed", () => {
    const s = savedRef.current;
    if (s?.phase !== "running") return;
    if (!s.behaviour.onlineMode) {
      update((state) => ({
        ...state,
        behaviour: { ...state.behaviour, onlineCount: state.behaviour.onlineCount + 1 },
      }));
      showNotice("online", "Интернет включился — учитель это видит. Выключи его, пока решаешь тест.");
    }
    report();
  });

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
        const { status, endsAt } = state.room;
        const timeIsUp = status === "running" && endsAt !== null && endsAt <= state.serverNow;
        if (state.me.submitted) {
          update((s) => ({ ...s, phase: "submitted", result: { score: state.me.score ?? 0, total: state.me.total ?? 0 } }));
        } else if (status === "finished" || timeIsUp) {
          // Тест закончился раньше, чем ученик успел его скачать
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
      update((s) => ({ ...s, phase: "finishing", finishedAt: Date.now(), timedOut: true }));
    }
  }, [phase, remaining, update]);

  // Пока тест идёт и есть интернет — раз в 10 секунд узнаём, не продлил ли учитель время
  // и не завершил ли тест. Без интернета это невозможно: тогда узнаем при отправке ответов.
  useEffect(() => {
    if ((phase !== "ready" && phase !== "running") || !online || !roomId) return;
    let stopped = false;
    const check = async () => {
      try {
        const state = await api<RoomState>(`/api/rooms/${roomId}`);
        if (stopped) return;
        const { status, endsAt } = state.room;
        if (status === "finished") {
          update((s) => ({ ...s, phase: "finishing", finishedAt: Date.now(), timedOut: false }));
          showNotice("time", "Учитель завершил тест.");
        } else if (endsAt !== null && endsAt !== savedRef.current?.test?.endsAt) {
          update((s) =>
            s.test ? { ...s, test: { ...s.test, endsAt, offset: state.serverNow - Date.now() } } : s,
          );
          showNotice("time", "Учитель добавил время.");
        }
      } catch {
        // нет связи — ничего страшного, тест работает и без неё
      }
    };
    const id = setInterval(check, 10_000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [phase, online, roomId, update, showNotice]);

  // 4. Во время теста следим, уходил ли ученик со страницы.
  // Момент ухода сохраняем в localStorage: если телефон выгрузит вкладку в фоне
  // или ученик перезагрузит страницу, уход всё равно засчитается.
  useEffect(() => {
    if (phase !== "running") return;

    // Ученик вернулся (или тест закончился, пока его не было) — засчитываем уход
    const comeBack = (silent: boolean) => {
      const since = savedRef.current?.awaySince;
      if (since == null) return;
      const duration = Math.max(0, Date.now() - since);
      const counted = duration >= 1500;
      update((s) => ({
        ...s,
        awaySince: null,
        behaviour: counted
          ? { ...s.behaviour, leaves: s.behaviour.leaves + 1, awayMs: s.behaviour.awayMs + duration }
          : s.behaviour,
      }));
      if (counted && !silent) {
        showNotice("leave", "Ты уходил со страницы теста — учитель это увидит.");
        report();
      }
    };

    const check = () => {
      const away = document.visibilityState === "hidden" || !document.hasFocus();
      if (away) {
        if (savedRef.current?.awaySince == null) update((s) => ({ ...s, awaySince: Date.now() }));
      } else {
        comeBack(false);
      }
    };

    check(); // страница могла открыться заново после ухода
    window.addEventListener("blur", check);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("blur", check);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      comeBack(true); // время вышло, пока ученик был на другой странице
    };
  }, [phase, update, showNotice, report]);

  // 5. Тест закончен — отправляем ответы, как только появится интернет
  const [submitError, setSubmitError] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const submit = useCallback(async () => {
    const s = savedRef.current;
    if (!s || s.phase !== "finishing" || sendingRef.current) return; // не отправляем дважды одновременно
    sendingRef.current = true;
    setSending(true);
    try {
      // Время вышло само, а учитель мог его продлить, — тогда тест продолжается, ответы на месте.
      // Ученик снова попадает на экран «выключи интернет», чтобы не решать дальше с ним.
      if (s.timedOut) {
        const state = await api<RoomState>(`/api/rooms/${s.roomId}`);
        const { status, endsAt } = state.room;
        if (status === "running" && endsAt !== null && endsAt > state.serverNow + 5000 && s.test) {
          update((prev) => ({
            ...prev,
            phase: "ready",
            timedOut: false,
            finishedAt: null,
            test: prev.test ? { ...prev.test, endsAt, offset: state.serverNow - Date.now() } : prev.test,
          }));
          setSubmitError("");
          return;
        }
      }
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
      setNeedLogin(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setNeedLogin(true);
        setSubmitError("Нужно войти заново. Ответы сохранены на этом устройстве — после входа тест откроется сам.");
      } else {
        setSubmitError(e instanceof Error ? e.message : "Не получилось отправить");
      }
    } finally {
      sendingRef.current = false;
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
              // После продления времени тест продолжается: начало и отметка «с интернетом» не сбрасываются
              startedAt: s.startedAt ?? Date.now(),
              behaviour: { ...s.behaviour, onlineMode: s.behaviour.onlineMode || withInternet },
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
          onFinish={() => update((s) => ({ ...s, phase: "finishing", finishedAt: Date.now(), timedOut: false }))}
        />
      )}

      {saved.phase === "finishing" && (
        <Finishing
          saved={saved}
          online={online}
          sending={sending}
          error={submitError}
          needLogin={needLogin}
          onSend={submit}
        />
      )}

      {saved.phase === "submitted" && <Result saved={saved} online={online} onLeave={leave} />}

      {saved.phase === "closed" && (
        <Centered>
          <h1 className="font-display text-2xl font-bold">Тест уже завершён</h1>
          <p className="mt-3 text-lg text-muted">Этот тест закончился раньше, чем ты успел его скачать.</p>
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
      role="timer"
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-[15px] font-bold tabular-nums ${
        urgent ? "bg-red text-white" : "bg-white text-ink shadow-[0_2px_0_var(--color-line)]"
      }`}
    >
      <ClockIcon className="size-4" />
      <span className="sr-only">Осталось</span>
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
  const resumed = saved.startedAt !== null; // вернулся после продления времени
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
        {resumed ? (
          <>
            <h1 className="mt-6 font-display text-[26px] font-bold leading-tight">Учитель добавил время</h1>
            <p className="mt-3 text-lg leading-relaxed">
              Твои ответы сохранены, тест можно продолжить. Снова <b>выключи интернет</b> и нажми «Продолжить».
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 font-display text-[26px] font-bold leading-tight">Тест загружен</h1>
            <p className="mt-3 text-lg leading-relaxed">
              {count} {plural(count, ["вопрос", "вопроса", "вопросов"])} уже на твоём устройстве. Теперь{" "}
              <b>выключи интернет</b>: Wi-Fi и мобильные данные. Тест будет работать без него.
            </p>
          </>
        )}
        <p className="mt-3 leading-relaxed text-muted">
          Если во время теста интернет включится или ты уйдёшь со страницы, учитель это увидит. Время уже идёт.
        </p>

        <div className="mt-7">
          <button className="btn btn-primary w-full text-lg" disabled={online} onClick={() => onStart(false)}>
            {resumed ? "Продолжить тест" : "Начать тест"}
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
  notice: Notice | null;
  onAnswer: (n: number, option: number) => void;
  onGo: (index: number) => void;
  onFinish: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const questions = saved.test!.questions;
  const total = questions.length;
  const index = Math.min(saved.current, total - 1);
  const question = questions[saved.order[index]];
  const optionOrder = saved.optionOrder[question.n] ?? question.options.map((_, i) => i);
  const answeredCount = Object.keys(saved.answers).length;
  const chosen = saved.answers[question.n];

  // Новый вопрос — показываем его с начала (на телефоне кнопка «Далее» внизу экрана)
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [index]);

  // Окно «Точно завершить?» стоит внизу — прокручиваем к нему, иначе на телефоне его не видно
  useEffect(() => {
    if (confirming) confirmRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [confirming]);

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
          ) : notice.kind === "time" ? (
            <ClockIcon className="mt-0.5 size-4 flex-none" />
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
          <div ref={confirmRef} className="panel mt-6 p-4">
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
  needLogin,
  onSend,
}: {
  saved: Saved;
  online: boolean;
  sending: boolean;
  error: string;
  needLogin: boolean;
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
      {needLogin && online ? (
        <a href="/login" className="btn btn-primary mt-8 w-full text-lg">
          Войти заново
        </a>
      ) : (
        <button className="btn btn-primary mt-8 w-full text-lg" disabled={!online || sending} onClick={onSend}>
          {sending ? <Spinner /> : null}
          {sending ? "Отправляем…" : "Отправить ответы"}
        </button>
      )}
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
  const score = saved.result?.score ?? 0;
  const total = saved.result?.total ?? 0;
  const hasReview = Boolean(result?.review);

  // Пока есть интернет, каждые 5 секунд узнаём, открыл ли учитель разбор ошибок
  useEffect(() => {
    if (!online || hasReview) return;
    let stopped = false;
    const load = () =>
      api<ResultPayload>(`/api/rooms/${saved.roomId}/result`)
        .then((data) => {
          if (!stopped) setResult(data);
        })
        .catch(() => {}); // без интернета разбор просто не покажем
    load();
    const id = setInterval(load, 5000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [online, hasReview, saved.roomId]);

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
              Разбор появится здесь сам, когда учитель завершит тест для всех: так никто не сможет подсказать ответы
              остальным.
            </p>
            {!online && <p className="mt-2 leading-relaxed text-muted">Включи интернет, чтобы его увидеть.</p>}
          </div>
        )}
      </section>
    </div>
  );
}

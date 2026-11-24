"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { CheckIcon, ClockIcon, LeaveIcon, WifiIcon, WifiOffIcon } from "@/components/icons";
import { ErrorText, FullScreenLoader, Logo, Spinner } from "@/components/ui";
import { api, ApiError, formatTimer } from "@/lib/client";
import { LangSwitch, localize, RU_TEXT, useLang } from "@/lib/i18n";
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

// Какую подсказку показать вверху (текст берётся из словаря на выбранном языке)
type Notice = "leave" | "online" | "finished" | "extended";

// Ошибки храним по-русски, а на таджикский переводим при показе (err() из i18n.tsx)
const RU_ERROR = RU_TEXT.error;
const SEND_FAILED = RU_TEXT.sendFailed;
const RE_LOGIN = RU_TEXT.reLogin;

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
  const { t, err } = useLang();

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
  const showNotice = useCallback((kind: Notice) => {
    setNotice(kind);
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
      showNotice("online");
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
        } else setError(e instanceof Error ? e.message : RU_ERROR);
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
          showNotice("finished");
        } else if (endsAt !== null && endsAt !== savedRef.current?.test?.endsAt) {
          update((s) =>
            s.test ? { ...s, test: { ...s.test, endsAt, offset: state.serverNow - Date.now() } } : s,
          );
          showNotice("extended");
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
        showNotice("leave");
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
        setSubmitError(RE_LOGIN);
      } else {
        setSubmitError(e instanceof Error ? e.message : SEND_FAILED);
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
      {saved.phase === "lobby" && <Lobby saved={saved} state={lobby} error={err(error)} onLeave={leave} />}

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
          error={err(submitError)}
          needLogin={needLogin}
          onSend={submit}
        />
      )}

      {saved.phase === "submitted" && <Result saved={saved} online={online} onLeave={leave} />}

      {saved.phase === "closed" && (
        <Centered>
          <div className="mb-6">
            <LangSwitch />
          </div>
          <h1 className="font-display text-2xl font-bold">{t.closed}</h1>
          <p className="mt-3 text-lg text-muted">{t.closedText}</p>
          <button className="btn btn-primary mt-8 w-full" onClick={leave}>
            {t.otherCode}
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
  const { t } = useLang();
  if (online) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
          warn ? "bg-red-soft text-red-edge" : "bg-sun-soft text-[#8a5a00]"
        }`}
      >
        <WifiIcon className="size-4" /> {t.online}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-soft px-3 py-1.5 text-sm font-semibold text-green-edge">
      <WifiOffIcon className="size-4" /> {t.offline}
    </span>
  );
}

function Timer({ remaining }: { remaining: number }) {
  const urgent = remaining < 60_000;
  const { t } = useLang();
  return (
    <span
      role="timer"
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-[15px] font-bold tabular-nums ${
        urgent ? "bg-red text-white" : "bg-white text-ink shadow-[0_2px_0_var(--color-line)]"
      }`}
    >
      <ClockIcon className="size-4" />
      <span className="sr-only">{t.timeLeft}</span>
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
  const { t } = useLang();
  return (
    <>
      <header className="flex items-center justify-between gap-2">
        <Logo compact />
        <div className="flex items-center gap-3">
          <LangSwitch />
          <button className="whitespace-nowrap text-[15px] font-semibold text-muted hover:text-ink" onClick={onLeave}>
            {t.leaveRoom}
          </button>
        </div>
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
        <p className="mt-8 text-lg text-muted">{t.youAreIn(saved.name)}</p>
        <h1 className="mt-1 font-display text-[26px] font-bold leading-tight">{state?.room.title ?? saved.title}</h1>
        <p className="mt-5 text-lg leading-relaxed">{t.waiting}</p>
        {state && (
          <dl className="mt-6 grid grid-cols-3 gap-2 text-center">
            <Stat value={state.room.questionCount} label={t.questionsWord(state.room.questionCount)} />
            <Stat value={state.room.durationMin} label={t.minutesWord(state.room.durationMin)} />
            <Stat value={state.joinedCount} label={t.studentsHere(state.joinedCount)} />
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
  const { t } = useLang();
  return (
    <>
      <header className="flex items-center justify-between gap-2">
        <Timer remaining={remaining} />
        <OnlineChip online={online} />
      </header>
      <Centered>
        <div className="mb-6">
          <LangSwitch />
        </div>
        <span className="grid size-14 place-items-center rounded-2xl bg-green text-white shadow-[0_4px_0_var(--color-green-edge)]">
          <CheckIcon className="size-8" />
        </span>
        {resumed ? (
          <>
            <h1 className="mt-6 font-display text-[26px] font-bold leading-tight">{t.extended}</h1>
            <p className="mt-3 text-lg leading-relaxed">
              {t.extendedText}
              <b>{t.turnOff}</b>
              {t.extendedText2}
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 font-display text-[26px] font-bold leading-tight">{t.loaded}</h1>
            <p className="mt-3 text-lg leading-relaxed">
              {t.loadedText(count)}
              <b>{t.turnOff}</b>
              {t.loadedText2}
            </p>
          </>
        )}
        <p className="mt-3 leading-relaxed text-muted">{t.watched}</p>

        <div className="mt-7">
          <button className="btn btn-primary w-full text-lg" disabled={online} onClick={() => onStart(false)}>
            {resumed ? t.resume : t.start}
          </button>
          {online && (
            <p className="mt-3 text-center text-[15px] text-muted">{t.startHint}</p>
          )}
        </div>

        {online && (
          <div className="mt-8 border-t border-line pt-5">
            {!withInternet ? (
              <button className="text-[15px] font-semibold text-muted underline underline-offset-4" onClick={() => setWithInternet(true)}>
                {t.cantTurnOff}
              </button>
            ) : (
              <div>
                <p className="leading-relaxed">{t.withInternetText}</p>
                <button className="btn btn-soft mt-3 w-full" onClick={() => onStart(true)}>
                  {t.startWithInternet}
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
  const { lang, t } = useLang();
  const shown = localize(question, lang);

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
          {notice === "online" ? (
            <WifiIcon className="mt-0.5 size-4 flex-none" />
          ) : notice === "leave" ? (
            <LeaveIcon className="mt-0.5 size-4 flex-none" />
          ) : (
            <ClockIcon className="mt-0.5 size-4 flex-none" />
          )}{" "}
          {notice === "online"
            ? t.noticeOnline
            : notice === "leave"
              ? t.noticeLeave
              : notice === "finished"
                ? t.noticeFinished
                : t.noticeExtended}
        </p>
      )}

      <section className="mt-5 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-semibold text-muted">{t.questionOf(index + 1, total)}</p>
          <LangSwitch />
        </div>
        <h1 lang={shown.htmlLang} className="mt-2 text-[22px] font-semibold leading-snug">
          {shown.text}
        </h1>
        {lang === "tj" && !shown.translated && <p className="mt-1 text-sm text-muted">{t.noTranslation}</p>}

        <div className="mt-5 space-y-3">
          {optionOrder.map((optionIndex, position) => (
            <button
              key={optionIndex}
              className="option"
              aria-pressed={chosen === optionIndex}
              onClick={() => onAnswer(question.n, optionIndex)}
            >
              <span className="option-letter">{LETTERS[position]}</span>
              <span lang={shown.htmlLang} className="text-[17px] leading-snug">
                {shown.options[optionIndex]}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button className="btn btn-soft" disabled={index === 0} onClick={() => onGo(index - 1)}>
            {t.back}
          </button>
          {index < total - 1 ? (
            <button className="btn btn-primary" onClick={() => onGo(index + 1)}>
              {t.next}
            </button>
          ) : (
            <button className="btn btn-green" onClick={() => setConfirming(true)}>
              {t.finish}
            </button>
          )}
        </div>
      </section>

      <nav className="mt-8" aria-label={t.allQuestions}>
        <p className="mb-2 text-sm font-semibold text-muted">{t.answered(answeredCount, total)}</p>
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
          {saved.order.map((questionIndex, position) => {
            const done = saved.answers[questions[questionIndex].n] !== undefined;
            const active = position === index;
            return (
              <button
                key={position}
                onClick={() => onGo(position)}
                aria-current={active ? "step" : undefined}
                aria-label={t.questionAria(position + 1, done)}
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
            {t.finishTest}
          </button>
        ) : (
          <div ref={confirmRef} className="panel mt-6 p-4">
            <p className="text-[17px] font-semibold">
              {answeredCount < total ? t.confirmPartial(answeredCount, total) : t.confirmAll}
            </p>
            <p className="mt-1 text-muted">{t.noChanges}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button className="btn btn-soft" onClick={() => setConfirming(false)}>
                {t.return}
              </button>
              <button className="btn btn-green" onClick={onFinish}>
                {t.finish}
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
  const { t } = useLang();
  return (
    <Centered>
      <div className="mb-6">
        <LangSwitch />
      </div>
      <h1 className="font-display text-[26px] font-bold leading-tight">{t.finished}</h1>
      <p className="mt-3 text-lg leading-relaxed">
        {t.savedHere(answered, saved.test?.questions.length ?? 0)}{" "}
        {online ? (
          t.sendingToTeacher
        ) : (
          <>
            <b>{t.turnOn}</b>
            {t.turnOnRest}
          </>
        )}
      </p>
      <div className="mt-6">
        <OnlineChip online={online} />
      </div>
      {needLogin && online ? (
        <a href="/login" className="btn btn-primary mt-8 w-full text-lg">
          {t.signInAgain}
        </a>
      ) : (
        <button className="btn btn-primary mt-8 w-full text-lg" disabled={!online || sending} onClick={onSend}>
          {sending ? <Spinner /> : null}
          {sending ? t.sending : t.send}
        </button>
      )}
      <div className="mt-4">
        <ErrorText>{online ? error : ""}</ErrorText>
      </div>
      <p className="mt-6 text-[15px] text-muted">{t.dontClose}</p>
    </Centered>
  );
}

// Номер похвалы в словаре: 0 — идеально … 4 — надо повторить
function verdict(part: number) {
  if (part === 1) return 0;
  if (part >= 0.8) return 1;
  if (part >= 0.6) return 2;
  if (part >= 0.4) return 3;
  return 4;
}

function Result({ saved, online, onLeave }: { saved: Saved; online: boolean; onLeave: () => void }) {
  const [result, setResult] = useState<ResultPayload | null>(null);
  const score = saved.result?.score ?? 0;
  const total = saved.result?.total ?? 0;
  const hasReview = Boolean(result?.review);
  const { lang, t } = useLang();

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
      <header className="flex items-center justify-between gap-2">
        <Logo compact />
        <div className="flex items-center gap-3">
          <LangSwitch />
          <button className="whitespace-nowrap text-[15px] font-semibold text-muted hover:text-ink" onClick={onLeave}>
            {t.logout}
          </button>
        </div>
      </header>

      <section className="mt-10">
        <p className="text-lg text-muted">{t.yourResult}</p>
        <p className="mt-2 font-display text-[64px] font-bold leading-none text-cobalt">
          {score}
          <span className="text-[32px] text-muted">
            {" "}
            {t.of} {total}
          </span>
        </p>
        <p className="mt-4 text-xl font-semibold">{t.verdicts[verdict(total ? score / total : 0)]}</p>
        <p className="mt-2 text-muted">{t.resultSent}</p>
      </section>

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="font-display text-lg font-bold">{t.review}</h2>
        {result?.review ? (
          <ol className="mt-4 space-y-3">
            {result.review.map((item, index) => {
              const ok = item.chosen === item.correct;
              const shown = localize(item, lang);
              return (
                <li key={item.n} className={`rounded-2xl border-2 bg-white p-4 ${ok ? "border-green-soft" : "border-red-soft"}`}>
                  <p className="text-sm font-semibold text-muted">
                    {index + 1}. {shown.topic}
                  </p>
                  <div lang={shown.htmlLang}>
                    <p className="mt-1 font-semibold leading-snug">{shown.text}</p>
                    <p className={`mt-2 text-[15px] ${ok ? "text-green-edge" : "text-red-edge"}`}>
                      {item.chosen === null ? t.noAnswer : t.yourAnswer(shown.options[item.chosen])}
                    </p>
                    {!ok && <p className="text-[15px] text-green-edge">{t.rightAnswer(shown.options[item.correct])}</p>}
                  </div>
                  {shown.explanation && (
                    <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-[15px] leading-relaxed">{shown.explanation}</p>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="mt-3">
            <p className="leading-relaxed text-muted">{t.reviewLater}</p>
            {!online && <p className="mt-2 leading-relaxed text-muted">{t.reviewOffline}</p>}
          </div>
        )}
      </section>
    </div>
  );
}

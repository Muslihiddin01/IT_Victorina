"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { StudentHeader } from "@/components/student-header";
import { TypingTest } from "@/components/typing-test";
import { ErrorText, FullScreenLoader, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/client";
import { RU_TEXT, useLang } from "@/lib/i18n";
import type { Me, RoomState, TypingMe } from "@/lib/types";
import { makeWords, TYPING_SECONDS, type TypingResult, type TypingSeconds } from "@/lib/typing";

export function Typing() {
  const [me, setMe] = useState<Me | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);

  useEffect(() => {
    api<{ user: Me | null }>("/api/me")
      .then(({ user }) => {
        if (!user) return window.location.replace("/login");
        setRoomId(new URLSearchParams(window.location.search).get("room"));
        setMe(user);
      })
      .catch(() => window.location.replace("/login"));
  }, []);

  if (!me) return <FullScreenLoader />;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-10 pt-4 sm:px-6">
      <StudentHeader active={roomId ? "join" : "practice"} />
      {roomId ? <RoomTyping roomId={roomId} /> : <PracticeTyping />}
    </main>
  );
}

// Тренировка: сколько угодно попыток, каждая сохраняется — лучший результат учитель видит в журнале
function PracticeTyping() {
  const { t, err } = useLang();
  const [seconds, setSeconds] = useState<TypingSeconds>(30);
  const [round, setRound] = useState(0);
  const [seed, setSeed] = useState<string | null>(null);
  const [result, setResult] = useState<TypingResult | null>(null);
  const [saved, setSaved] = useState<{ wpm: number; record: boolean } | null>(null);
  const [info, setInfo] = useState<TypingMe | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  // Новые случайные слова на каждую попытку (seed уходит на сервер вместе с ответом)
  const words = useMemo(() => (seed ? makeWords(seed) : null), [seed]);

  useEffect(() => {
    api<TypingMe>("/api/typing")
      .then(setInfo)
      .catch(() => {});
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeed(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
    setResult(null);
    setSaved(null);
    setError("");
  }, [round, seconds]);

  async function send(next: TypingResult) {
    if (!seed) return;
    setSending(true);
    setError("");
    try {
      const data = await api<TypingMe & { wpm: number; record: boolean }>("/api/typing", {
        method: "POST",
        body: { seed, seconds, typed: next.typed, current: next.current },
      });
      setSaved({ wpm: data.wpm, record: data.record });
      setInfo({ best: data.best, goal: data.goal });
    } catch (e) {
      setError(e instanceof Error ? e.message : RU_TEXT.error);
    } finally {
      setSending(false);
    }
  }

  const finish = useCallback(
    (next: TypingResult) => {
      setResult(next);
      send(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed, seconds],
  );

  const passed = info !== null && info.best !== null && info.best >= info.goal;
  return (
    <section className="mt-6">
      <a href="/practice" className="text-[15px] font-semibold text-cobalt">
        ← {t.backToTopics}
      </a>
      <h1 className="mt-3 font-display text-[28px] font-bold leading-tight">{t.typingTitle}</h1>
      <p className="mt-2 text-lg leading-relaxed text-muted">{t.typingLead}</p>

      {info && (
        <div className="mt-4 flex flex-wrap gap-2 text-[15px]">
          <span className="rounded-full bg-white px-3 py-1.5 shadow-[0_2px_0_var(--color-line)]">
            🏆 {t.typingRecord}: <b>{info.best ?? "—"}</b>
          </span>
          <span
            className={`rounded-full px-3 py-1.5 font-semibold ${
              passed ? "bg-green-soft text-green-edge" : "bg-sun-soft text-[#7a4f00]"
            }`}
          >
            {passed ? "✅ " : ""}
            {t.typingGoal(info.goal)}
          </span>
        </div>
      )}

      <div className="mt-5 flex items-center gap-2">
        {TYPING_SECONDS.map((value) => (
          <button
            key={value}
            className={`btn btn-sm ${seconds === value ? "btn-primary" : "btn-soft"}`}
            disabled={sending}
            onClick={() => {
              setSeconds(value);
              setRound(round + 1);
            }}
          >
            {t.typingSeconds(value)}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {result ? (
          <>
            <Result wpm={saved?.wpm ?? result.wpm} seconds={seconds} goal={info?.goal ?? null} />
            {saved?.record && (
              <p className="mt-3 text-center text-lg font-semibold text-cobalt">🏆 {t.typingNewRecord}</p>
            )}
            {sending && <p className="mt-3 text-center text-muted">{t.sending}</p>}
            {error && (
              <div className="mt-3">
                <ErrorText>{err(error)}</ErrorText>
                <button className="btn btn-primary mt-3 w-full" disabled={sending} onClick={() => send(result)}>
                  {t.send}
                </button>
              </div>
            )}
          </>
        ) : words ? (
          <TypingTest key={seed} words={words} seconds={seconds} onFinish={finish} />
        ) : null}
      </div>

      <button className="btn btn-soft mt-6 w-full" disabled={sending} onClick={() => setRound(round + 1)}>
        {t.typingRestart}
      </button>
    </section>
  );
}

// Результат и норма этапа: набрал — зелёная карточка, не набрал — синяя и сколько не хватило
function Result({ wpm, seconds, goal }: { wpm: number; seconds: number; goal: number | null }) {
  const { t } = useLang();
  const passed = goal !== null && wpm >= goal;
  return (
    <>
      <div
        className={`rounded-[24px] px-6 py-8 text-center text-white ${
          passed
            ? "bg-green shadow-[0_5px_0_var(--color-green-edge)]"
            : "bg-cobalt shadow-[0_5px_0_var(--color-cobalt-edge)]"
        }`}
      >
        <p className="font-display text-[72px] font-bold leading-none tabular-nums">{wpm}</p>
        <p className="mt-2 text-xl font-semibold">{t.wpm}</p>
        <p className="mt-1 text-white/80">{t.typingSeconds(seconds)}</p>
      </div>
      {goal !== null && (
        <p
          className={`mt-4 rounded-2xl px-5 py-4 text-center text-lg font-semibold ${
            passed ? "bg-green-soft text-green-edge" : "bg-sun-soft text-[#7a4f00]"
          }`}
        >
          {passed ? `✅ ${t.typingGoalPassed(goal)}` : t.typingGoalMissed(goal, goal - wpm)}
        </p>
      )}
    </>
  );
}

// Тест учителя: ждём начала, печатаем один раз, результат уходит учителю
function RoomTyping({ roomId }: { roomId: string }) {
  const { t, err } = useLang();
  const [state, setState] = useState<RoomState | null>(null);
  const [result, setResult] = useState<TypingResult | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  // Слова зависят только от комнаты: у всего класса одинаковый текст (честное соревнование)
  const words = useMemo(() => makeWords(roomId), [roomId]);

  const load = useCallback(async () => {
    try {
      setState(await api<RoomState>(`/api/rooms/${roomId}`));
      setError("");
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) window.location.replace("/join");
      else setError(e instanceof Error ? e.message : RU_TEXT.error);
    }
  }, [roomId]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = setInterval(load, 2000);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [load]);

  async function send(next: TypingResult) {
    setSending(true);
    setError("");
    try {
      const { wpm } = await api<{ wpm: number }>(`/api/rooms/${roomId}/submit`, {
        method: "POST",
        body: { typed: next.typed, current: next.current },
      });
      setSent(wpm);
    } catch (e) {
      setError(e instanceof Error ? e.message : RU_TEXT.error);
    } finally {
      setSending(false);
    }
  }

  const finish = useCallback(
    (next: TypingResult) => {
      setResult(next);
      send(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomId],
  );

  if (!state) {
    return error ? (
      <div className="mt-6">
        <ErrorText>{err(error)}</ErrorText>
      </div>
    ) : (
      <Spinner className="mt-8 size-6 text-cobalt" />
    );
  }

  const { room, me } = state;
  const seconds = room.typingSec ?? 60;
  const wpm = sent ?? me.wpm;

  return (
    <section className="mt-6">
      <h1 className="font-display text-[26px] font-bold leading-tight">{room.title}</h1>
      <p className="mt-2 text-lg leading-relaxed text-muted">{t.typingRoomLead(seconds)}</p>

      <div className="mt-6">
        {wpm !== null && (me.submitted || sent !== null) ? (
          <>
            <Result wpm={wpm} seconds={seconds} goal={room.typingGoal} />
            <p className="mt-4 text-center text-muted">{t.typingSent}</p>
          </>
        ) : result ? (
          // Время вышло, результат отправляется (или не отправился — тогда можно повторить)
          <>
            <Result wpm={result.wpm} seconds={seconds} goal={room.typingGoal} />
            <div className="mt-4">
              <ErrorText>{err(error)}</ErrorText>
            </div>
            {error && (
              <button className="btn btn-primary mt-3 w-full" disabled={sending} onClick={() => send(result)}>
                {sending ? <Spinner /> : null} {t.send}
              </button>
            )}
            {sending && !error && <p className="mt-3 text-center text-muted">{t.sending}</p>}
          </>
        ) : room.status === "waiting" ? (
          <div className="rounded-[24px] bg-white px-6 py-8 text-center shadow-[0_4px_0_var(--color-line)]">
            <Spinner className="mx-auto size-7 text-cobalt" />
            <p className="mt-4 text-lg font-semibold">{t.typingWaiting}</p>
            <p className="mt-1 text-muted">
              {state.joinedCount} {t.studentsHere(state.joinedCount)}
            </p>
          </div>
        ) : room.status === "finished" ? (
          <p className="rounded-2xl bg-white px-5 py-6 text-lg font-semibold shadow-[0_4px_0_var(--color-line)]">
            {t.typingClosed}
          </p>
        ) : (
          <>
            <p className="mb-3 text-[15px] font-semibold text-[#7a4f00]">{t.typingOneTry}</p>
            <TypingTest words={words} seconds={seconds} onFinish={finish} />
          </>
        )}
      </div>

      <a href="/join" className="btn btn-soft mt-8 w-full">
        {t.otherCode}
      </a>
    </section>
  );
}

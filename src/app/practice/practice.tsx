"use client";

import { useCallback, useEffect, useState } from "react";

import { CheckIcon } from "@/components/icons";
import { QuestionImage } from "@/components/question-image";
import { StudentHeader } from "@/components/student-header";
import { ErrorText, FullScreenLoader, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/client";
import { localize, RU_TEXT, useLang } from "@/lib/i18n";
import type { Me, PracticeSet, PracticeTopic } from "@/lib/types";

const LETTERS = ["А", "Б", "В", "Г", "Д", "Е"];
const ALL = "all";
const ALL_COUNT = 20; // столько вопросов в «Все темы» (как на сервере)

// Какая тема открыта — хранится в адресе (/practice?topic=3), чтобы обновление страницы не сбрасывало выбор
function topicFromUrl() {
  return new URLSearchParams(window.location.search).get("topic");
}
function setTopicInUrl(topic: string | null) {
  window.history.replaceState(null, "", topic ? `/practice?topic=${topic}` : "/practice");
}

export function Practice() {
  const [me, setMe] = useState<Me | null>(null);
  const [topics, setTopics] = useState<PracticeTopic[] | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { lang, t, err } = useLang();

  useEffect(() => {
    api<{ user: Me | null }>("/api/me")
      .then(async ({ user }) => {
        if (!user) {
          window.location.replace("/login");
          return;
        }
        setMe(user);
        setTopic(topicFromUrl());
        const data = await api<{ topics: PracticeTopic[] }>("/api/practice");
        setTopics(data.topics);
      })
      .catch((e) => setError(e instanceof Error ? e.message : RU_TEXT.error));
  }, []);

  // useCallback — чтобы смена языка не перезапускала тренировку (Session зависит от этих функций)
  const open = useCallback((next: string | null) => {
    setTopicInUrl(next);
    setTopic(next);
    window.scrollTo({ top: 0 });
  }, []);
  const backToList = useCallback(() => open(null), [open]);

  if (!me && !error) return <FullScreenLoader />;

  const total = topics?.reduce((sum, item) => sum + item.count, 0) ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-10 pt-4 sm:px-6">
      <StudentHeader active="practice" />

      {topic ? (
        <Session key={topic} topic={topic} onBack={backToList} />
      ) : (
        <section className="mt-6">
          <h1 className="font-display text-[28px] font-bold leading-tight">{t.practiceTitle}</h1>
          <p className="mt-2 text-lg leading-relaxed text-muted">{t.practiceLead}</p>
          <ErrorText>{err(error)}</ErrorText>

          {/* Печатание на скорость — обычная ссылка, страница загрузится целиком */}
          <a
            href="/typing"
            className="mt-6 flex w-full items-center gap-4 rounded-[20px] border-[1.5px] border-line bg-white p-4 text-left shadow-[0_4px_0_var(--color-line)] transition hover:border-key-edge active:translate-y-1 active:shadow-none"
          >
            <span className="flex gap-1 text-[15px]" aria-hidden>
              <span className="keycap size-[1.9em] -rotate-6 !bg-cobalt-soft">A</span>
              <span className="keycap size-[1.9em] rotate-6 !bg-cobalt-soft">Z</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg font-bold leading-snug">{t.typingTitle}</span>
              <span className="block text-[15px] text-muted">{t.typingCardHint}</span>
            </span>
          </a>

          {!topics ? (
            !error && <Spinner className="mt-6 size-6 text-cobalt" />
          ) : topics.length === 0 ? (
            <p className="mt-6 text-muted">{t.noTopics}</p>
          ) : (
            <div className="mt-6 space-y-3">
              <button
                className="flex w-full items-center gap-4 rounded-[20px] bg-cobalt p-4 text-left text-white shadow-[0_5px_0_var(--color-cobalt-edge)] transition active:translate-y-1 active:shadow-none"
                onClick={() => open(ALL)}
              >
                <span className="flex gap-1 text-[15px]" aria-hidden>
                  <span className="keycap size-[1.9em] -rotate-6">?</span>
                  <span className="keycap size-[1.9em] rotate-6">!</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg font-bold leading-snug">{t.allTopics}</span>
                  <span className="block text-[15px] text-white/85">{t.allTopicsHint(Math.min(ALL_COUNT, total))}</span>
                </span>
              </button>

              <ol className="space-y-2">
                {topics.map((item) => (
                  <li key={item.id}>
                    <button
                      className="flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-line bg-white px-4 py-3 text-left shadow-[0_3px_0_var(--color-line)] transition hover:border-key-edge active:translate-y-[3px] active:shadow-none"
                      onClick={() => open(String(item.id))}
                    >
                      <span lang={lang === "tj" && item.titleTj ? "tg" : "ru"} className="min-w-0 flex-1 font-semibold leading-snug">
                        {(lang === "tj" && item.titleTj) || item.title}
                      </span>
                      <span className="flex-none text-sm text-muted">{t.topicCount(item.count)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

// Номер похвалы в словаре: 0 — идеально … 4 — надо повторить (как в тесте)
function verdict(part: number) {
  if (part === 1) return 0;
  if (part >= 0.8) return 1;
  if (part >= 0.6) return 2;
  if (part >= 0.4) return 3;
  return 4;
}

function Session({ topic, onBack }: { topic: string; onBack: () => void }) {
  const [set, setSet] = useState<PracticeSet | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({}); // номер вопроса → выбранный вариант
  const [error, setError] = useState("");
  const { lang, t, err } = useLang();

  const load = useCallback(async () => {
    setSet(null);
    setError("");
    setIndex(0);
    setAnswers({});
    try {
      setSet(await api<PracticeSet>(`/api/practice/questions?topic=${encodeURIComponent(topic)}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) onBack(); // тему удалили — назад к списку
      else setError(e instanceof Error ? e.message : RU_TEXT.error);
    }
  }, [topic, onBack]);

  useEffect(() => {
    // Загрузка вопросов при открытии темы
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Новый вопрос — показываем его с начала
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [index]);

  const back = (
    <button className="text-[15px] font-semibold text-cobalt" onClick={onBack}>
      ← {t.backToTopics}
    </button>
  );

  if (error) {
    return (
      <section className="mt-6">
        {back}
        <div className="mt-4">
          <ErrorText>{err(error)}</ErrorText>
        </div>
        <button className="btn btn-soft mt-4" onClick={load}>
          {t.again}
        </button>
      </section>
    );
  }
  if (!set) return <Spinner className="mt-8 size-6 text-cobalt" />;

  const title = (lang === "tj" && set.titleTj) || set.title;
  const total = set.questions.length;
  const done = Object.keys(answers).length;
  const score = set.questions.filter((q) => answers[q.n] === q.correct).length;

  if (total === 0) {
    return (
      <section className="mt-6">
        {back}
        <p className="mt-4 text-muted">{t.noTopics}</p>
      </section>
    );
  }

  // Все ответы даны и нажали «Завершить» — итог
  if (index >= total) {
    return (
      <section className="mt-6">
        {back}
        <p className="mt-6 text-lg text-muted">{t.practiceDone}</p>
        <h1 className="mt-1 font-display text-[22px] font-bold leading-tight">{title}</h1>
        <p className="mt-4 font-display text-[56px] font-bold leading-none text-cobalt">
          {score}
          <span className="text-[28px] text-muted">
            {" "}
            {t.of} {total}
          </span>
        </p>
        <p className="mt-4 text-xl font-semibold">{t.verdicts[verdict(score / total)]}</p>
        <div className="mt-8 grid grid-cols-2 gap-3">
          <button className="btn btn-soft" onClick={onBack}>
            {t.otherTopic}
          </button>
          <button className="btn btn-primary" onClick={load}>
            {t.again}
          </button>
        </div>
      </section>
    );
  }

  const question = set.questions[index];
  const shown = localize(question, lang);
  const chosen = answers[question.n];
  const answered = chosen !== undefined;
  const ok = chosen === question.correct;

  return (
    <section className="mt-5 flex-1">
      <div className="flex items-center justify-between gap-3">
        {back}
        <span className="text-sm font-semibold text-muted">{t.scoreNow(score, done)}</span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-cobalt transition-all" style={{ width: `${(done / total) * 100}%` }} />
      </div>

      <p className="mt-4 text-[15px] font-semibold text-muted">
        {t.questionOf(index + 1, total)}
        {topic === ALL && <> · {shown.topic}</>}
      </p>
      <h1 lang={shown.htmlLang} className="mt-2 text-[22px] font-semibold leading-snug">
        {shown.text}
      </h1>
      {lang === "tj" && !shown.translated && <p className="mt-1 text-sm text-muted">{t.noTranslation}</p>}
      <QuestionImage id={question.image} className="mt-4" />

      <div className="mt-5 space-y-3">
        {shown.options.map((option, i) => {
          const state = !answered ? undefined : i === question.correct ? "right" : i === chosen ? "wrong" : undefined;
          return (
            <button
              key={`${question.n}-${i}`} // новые кнопки для нового вопроса, иначе зелёный цвет прошлого ответа «перетекает»
              className="option"
              data-state={state}
              disabled={answered}
              onClick={() => setAnswers({ ...answers, [question.n]: i })}
            >
              <span className="option-letter">{state === "right" ? <CheckIcon className="size-5" /> : LETTERS[i]}</span>
              <span lang={shown.htmlLang} className="text-[17px] leading-snug">
                {option}
              </span>
            </button>
          );
        })}
      </div>

      {answered && (
        <div
          role="status"
          className={`mt-5 rounded-2xl px-4 py-3 ${ok ? "bg-green-soft text-green-edge" : "bg-red-soft text-red-edge"}`}
        >
          <p className="font-display text-lg font-bold">{ok ? t.right : t.wrong}</p>
          {!ok && (
            <p lang={shown.htmlLang} className="mt-1 font-semibold">
              {t.correctIs(shown.options[question.correct])}
            </p>
          )}
          {shown.explanation && (
            <p lang={shown.htmlLang} className="mt-2 leading-relaxed text-ink">
              {shown.explanation}
            </p>
          )}
        </div>
      )}

      <div className="mt-6">
        <button className="btn btn-primary w-full text-lg" disabled={!answered} onClick={() => setIndex(index + 1)}>
          {index < total - 1 ? t.next : t.finish}
        </button>
      </div>
    </section>
  );
}

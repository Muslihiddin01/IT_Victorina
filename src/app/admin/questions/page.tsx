"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { CheckIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { ErrorText, Spinner } from "@/components/ui";
import { api, plural } from "@/lib/client";
import { parseQuestions } from "@/lib/question-text";
import type { Question, Topic } from "@/lib/types";

const LETTERS = ["А", "Б", "В", "Г", "Д", "Е"];

type Draft = {
  id?: string;
  topicId: number;
  text: string;
  options: string[];
  correct: number;
  explanation: string;
  // Таджикский перевод. Варианты идут парами с options: optionsTj[2] — перевод options[2].
  textTj: string;
  optionsTj: string[];
  explanationTj: string;
};

const hasTj = (question: Question) => Boolean(question.textTj && question.optionsTj?.length);

export default function QuestionsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [topicId, setTopicId] = useState<number | null>(null); // null — все темы
  const [onlyUntranslated, setOnlyUntranslated] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await api<{ topics: Topic[]; questions: Question[] }>("/api/admin/questions");
    setTopics(data.topics);
    setQuestions(data.questions);
  }, []);

  useEffect(() => {
    api<{ topics: Topic[]; questions: Question[] }>("/api/admin/questions")
      .then((data) => {
        setTopics(data.topics);
        setQuestions(data.questions);
      })
      .catch((e) => setError(e.message));
  }, []);

  const inTopic = (questions ?? []).filter((q) => topicId === null || q.topicId === topicId);
  const untranslated = inTopic.filter((q) => !hasTj(q)).length;
  const visible = onlyUntranslated ? inTopic.filter((q) => !hasTj(q)) : inTopic;
  const topicTitle = (id: number) => topics.find((t) => t.id === id)?.title ?? "";
  const selectedTopic = topics.find((t) => t.id === topicId) ?? null;

  const [bulk, setBulk] = useState(false);
  const [notice, setNotice] = useState("");

  function newDraft() {
    setBulk(false);
    setDraft({
      topicId: topicId ?? topics.at(-1)?.id ?? 0,
      text: "",
      options: ["", "", "", ""],
      correct: 0,
      explanation: "",
      textTj: "",
      optionsTj: ["", "", "", ""],
      explanationTj: "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-4">
        <h1 className="font-display text-xl font-bold">Темы</h1>
        <nav className="space-y-1">
          <TopicButton active={topicId === null} onClick={() => setTopicId(null)} title="Все вопросы" count={questions?.length ?? 0} />
          {topics.map((topic) => (
            <TopicButton
              key={topic.id}
              active={topicId === topic.id}
              onClick={() => setTopicId(topic.id)}
              title={topic.title}
              count={topic.questionCount}
            />
          ))}
        </nav>
        {selectedTopic && (
          <TopicTools
            key={selectedTopic.id}
            topic={selectedTopic}
            onRenamed={load}
            onDeleted={async () => {
              setTopicId(null);
              await load();
            }}
          />
        )}
        <NewTopic
          onCreated={async (id) => {
            await load();
            setTopicId(id);
          }}
        />
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold">
            {topicId === null ? "Все вопросы" : topicTitle(topicId)}
            <span className="text-muted"> {inTopic.length}</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-soft btn-sm"
              onClick={() => {
                setDraft(null);
                setBulk(true);
                setNotice("");
              }}
            >
              Добавить списком
            </button>
            <button className="btn btn-primary btn-sm" onClick={newDraft} disabled={topics.length === 0}>
              <PlusIcon className="size-4" /> Добавить вопрос
            </button>
          </div>
        </div>
        {questions && (untranslated > 0 || onlyUntranslated) && (
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-full bg-sun-soft px-3 py-1.5 text-sm font-semibold text-[#7a4f00]">
            <input type="checkbox" checked={onlyUntranslated} onChange={(e) => setOnlyUntranslated(e.target.checked)} />
            Только без таджикского перевода: {untranslated}
          </label>
        )}
        <ErrorText>{error}</ErrorText>
        {notice && (
          <p role="status" className="rounded-xl bg-green-soft px-3.5 py-2.5 text-[15px] font-medium text-green-edge">
            {notice}
          </p>
        )}

        {bulk && (
          <BulkImport
            topics={topics}
            defaultTopicId={topicId ?? topics.at(-1)?.id ?? null}
            onCancel={() => setBulk(false)}
            onImported={async (message) => {
              setBulk(false);
              setNotice(message);
              await load();
            }}
          />
        )}

        {draft && (
          <Editor
            // Иначе при нажатии «Изменить» у другого вопроса в форме оставался прошлый вопрос
            key={draft.id ?? "new"}
            draft={draft}
            topics={topics}
            onCancel={() => setDraft(null)}
            onSaved={async () => {
              setDraft(null);
              await load();
            }}
          />
        )}

        {!questions ? (
          <Spinner className="size-6 text-cobalt" />
        ) : visible.length === 0 ? (
          <p className="text-muted">{onlyUntranslated ? "Все вопросы здесь переведены." : "В этой теме пока нет вопросов."}</p>
        ) : (
          <ol className="space-y-3">
            {visible.map((question, index) => (
              <QuestionCard
                key={question.id}
                index={index}
                question={question}
                topic={topicId === null ? topicTitle(question.topicId) : null}
                onEdit={() => {
                  setBulk(false);
                  setDraft({
                    ...question,
                    options: [...question.options],
                    explanation: question.explanation ?? "",
                    textTj: question.textTj ?? "",
                    optionsTj: question.options.map((_, i) => question.optionsTj?.[i] ?? ""),
                    explanationTj: question.explanationTj ?? "",
                  });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onDeleted={load}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function TopicButton({ active, onClick, title, count }: { active: boolean; onClick: () => void; title: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition ${
        active ? "bg-cobalt text-white shadow-[0_3px_0_var(--color-cobalt-edge)]" : "hover:bg-white"
      }`}
    >
      <span className="flex-1 leading-snug">{title}</span>
      <span className={`text-sm ${active ? "text-white/80" : "text-muted"}`}>{count}</span>
    </button>
  );
}

function NewTopic({ onCreated }: { onCreated: (id: number) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [titleTj, setTitleTj] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const { id } = await api<{ id: number }>("/api/admin/topics", { method: "POST", body: { title, titleTj } });
      setTitle("");
      setTitleTj("");
      await onCreated(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-line pt-4">
      <label className="label" htmlFor="topic">
        Новая тема
      </label>
      <input id="topic" className="input" placeholder="Урок 8. …" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input
        className="input"
        lang="tg"
        placeholder="По-таджикски: Дарси 8. … (можно позже)"
        aria-label="Название темы по-таджикски"
        value={titleTj}
        onChange={(e) => setTitleTj(e.target.value)}
      />
      <button className="btn btn-soft btn-sm" disabled={!title.trim()}>
        <PlusIcon className="size-4" /> Добавить тему
      </button>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

// Переименовать выбранную тему или удалить её, если в ней нет вопросов
function TopicTools({
  topic,
  onRenamed,
  onDeleted,
}: {
  topic: Topic;
  onRenamed: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(topic.title);
  const [titleTj, setTitleTj] = useState(topic.titleTj ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  function rename(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      await api(`/api/admin/topics/${topic.id}`, { method: "PATCH", body: { title, titleTj } });
      await onRenamed();
      setRenaming(false);
    });
  }

  return (
    <div className="space-y-2 border-t border-line pt-4">
      {renaming ? (
        <form onSubmit={rename} className="space-y-2">
          <label className="label" htmlFor="topic-title">
            Название темы
          </label>
          <input id="topic-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input
            className="input"
            lang="tg"
            placeholder="По-таджикски"
            aria-label="Название темы по-таджикски"
            value={titleTj}
            onChange={(e) => setTitleTj(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={busy || !title.trim()}>
              Сохранить
            </button>
            <button
              type="button"
              className="btn btn-soft btn-sm"
              onClick={() => {
                setRenaming(false);
                setTitle(topic.title);
                setTitleTj(topic.titleTj ?? "");
              }}
            >
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <p lang="tg" className={`w-full text-[15px] ${topic.titleTj ? "" : "italic text-muted"}`}>
            {topic.titleTj || "Нет названия по-таджикски"}
          </p>
          <button className="btn btn-soft btn-sm" onClick={() => setRenaming(true)}>
            Переименовать тему
          </button>
          {topic.questionCount === 0 && (
            <button
              className="btn btn-danger btn-sm"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api(`/api/admin/topics/${topic.id}`, { method: "DELETE" });
                  await onDeleted();
                })
              }
            >
              <TrashIcon className="size-4" /> Удалить пустую тему
            </button>
          )}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function Editor({
  draft: initial,
  topics,
  onCancel,
  onSaved,
}: {
  draft: Draft;
  topics: Topic[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState(false);

  // Что можно перевести: русское поле заполнено, а таджикское ещё пустое.
  // То, что учитель уже перевёл или поправил сам, не трогаем.
  const toTranslate = [
    { ru: draft.text, tj: draft.textTj, key: "text" as const, index: -1 },
    ...draft.options.map((ru, index) => ({ ru, tj: draft.optionsTj[index] ?? "", key: "option" as const, index })),
    { ru: draft.explanation, tj: draft.explanationTj, key: "explanation" as const, index: -1 },
  ].filter((field) => field.ru.trim() && !field.tj.trim());

  async function autoTranslate() {
    if (toTranslate.length === 0) return;
    setTranslating(true);
    setError("");
    try {
      const { translations } = await api<{ translations: string[] }>("/api/admin/translate", {
        method: "POST",
        body: { texts: toTranslate.map((field) => field.ru) },
      });
      // Берём свежий черновик: пока шёл перевод, учитель мог что-то дописать
      setDraft((current) => {
        const next = { ...current, optionsTj: [...current.optionsTj] };
        toTranslate.forEach((field, i) => {
          const value = translations[i] ?? "";
          if (field.key === "text" && !next.textTj.trim()) next.textTj = value;
          if (field.key === "explanation" && !next.explanationTj.trim()) next.explanationTj = value;
          if (field.key === "option" && !next.optionsTj[field.index]?.trim()) next.optionsTj[field.index] = value;
        });
        return next;
      });
      setTranslated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось перевести");
    } finally {
      setTranslating(false);
    }
  }

  const setOption = (index: number, value: string) =>
    setDraft({ ...draft, options: draft.options.map((option, i) => (i === index ? value : option)) });
  const setOptionTj = (index: number, value: string) =>
    setDraft({ ...draft, optionsTj: draft.optionsTj.map((option, i) => (i === index ? value : option)) });

  // Вариант убираем сразу на обоих языках, чтобы пары не разъехались
  function removeOption(index: number) {
    const options = draft.options.filter((_, i) => i !== index);
    const optionsTj = draft.optionsTj.filter((_, i) => i !== index);
    const correct = draft.correct === index ? 0 : draft.correct > index ? draft.correct - 1 : draft.correct;
    setDraft({ ...draft, options, optionsTj, correct });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = {
        topicId: draft.topicId,
        text: draft.text,
        options: draft.options,
        correct: draft.correct,
        explanation: draft.explanation,
        textTj: draft.textTj,
        optionsTj: draft.optionsTj,
        explanationTj: draft.explanationTj,
      };
      if (draft.id) await api(`/api/admin/questions/${draft.id}`, { method: "PUT", body });
      else await api("/api/admin/questions", { method: "POST", body });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="panel space-y-4 border-cobalt p-5 shadow-[0_4px_0_var(--color-cobalt-soft)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-bold">{draft.id ? "Изменить вопрос" : "Новый вопрос"}</h3>
        <button
          type="button"
          className="btn btn-soft btn-sm"
          disabled={translating || toTranslate.length === 0}
          title={toTranslate.length === 0 ? "Пустых таджикских полей нет" : "Заполнит пустые таджикские поля"}
          onClick={autoTranslate}
        >
          {translating ? <Spinner /> : null} Перевести на таджикский
        </button>
      </div>
      {translated && (
        <p role="status" className="rounded-xl bg-sun-soft px-3.5 py-2.5 text-[15px] font-medium text-[#7a4f00]">
          Перевод сделан автоматически — проверьте его перед сохранением: машина может ошибиться в терминах.
        </p>
      )}
      <div>
        <label className="label" htmlFor="q-topic">
          Тема
        </label>
        <select
          id="q-topic"
          className="input"
          value={draft.topicId}
          onChange={(e) => setDraft({ ...draft, topicId: Number(e.target.value) })}
        >
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.title}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="q-text">
            Вопрос по-русски
          </label>
          <textarea
            id="q-text"
            className="input min-h-24 resize-y leading-relaxed"
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="q-text-tj">
            По-таджикски <span className="font-normal text-muted">(можно позже)</span>
          </label>
          <textarea
            id="q-text-tj"
            lang="tg"
            className="input min-h-24 resize-y leading-relaxed"
            value={draft.textTj}
            onChange={(e) => setDraft({ ...draft, textTj: e.target.value })}
          />
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="label">Варианты ответа: отметьте правильный. Справа — тот же вариант по-таджикски</legend>
        {draft.options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <label
              className={`grid size-11 flex-none cursor-pointer place-items-center rounded-xl font-display text-sm font-bold transition ${
                draft.correct === index ? "bg-green text-white shadow-[0_3px_0_var(--color-green-edge)]" : "bg-paper text-muted"
              }`}
              title="Правильный ответ"
            >
              <input
                type="radio"
                name="correct"
                className="sr-only"
                checked={draft.correct === index}
                onChange={() => setDraft({ ...draft, correct: index })}
              />
              {draft.correct === index ? <CheckIcon /> : LETTERS[index]}
            </label>
            <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2">
              <input
                className="input"
                value={option}
                placeholder={`Вариант ${LETTERS[index]}`}
                onChange={(e) => setOption(index, e.target.value)}
                aria-label={`Вариант ${LETTERS[index]}`}
              />
              <input
                className="input"
                lang="tg"
                value={draft.optionsTj[index] ?? ""}
                placeholder={`Ҷавоби ${LETTERS[index]} (тоҷ.)`}
                onChange={(e) => setOptionTj(index, e.target.value)}
                aria-label={`Вариант ${LETTERS[index]} по-таджикски`}
              />
            </div>
            {draft.options.length > 2 && (
              <button type="button" className="btn btn-soft !px-3" aria-label="Убрать вариант" onClick={() => removeOption(index)}>
                <TrashIcon className="size-4" />
              </button>
            )}
          </div>
        ))}
        {draft.options.length < 6 && (
          <button type="button" className="text-[15px] font-semibold text-cobalt" onClick={() => setDraft({ ...draft, options: [...draft.options, ""], optionsTj: [...draft.optionsTj, ""] })}>
            + ещё вариант
          </button>
        )}
      </fieldset>
      <div>
        <label className="label" htmlFor="q-explanation">
          Пояснение (необязательно): ученик увидит его в разборе ошибок
        </label>
        <textarea
          id="q-explanation"
          className="input min-h-20 resize-y leading-relaxed"
          placeholder="Почему правильный ответ именно такой"
          value={draft.explanation}
          onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
        />
        <textarea
          lang="tg"
          aria-label="Пояснение по-таджикски"
          className="input mt-2 min-h-20 resize-y leading-relaxed"
          placeholder="То же пояснение по-таджикски (можно не писать)"
          value={draft.explanationTj}
          onChange={(e) => setDraft({ ...draft, explanationTj: e.target.value })}
        />
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-3">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? <Spinner /> : null} Сохранить
        </button>
        <button type="button" className="btn btn-soft" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}

function QuestionCard({
  question,
  index,
  topic,
  onEdit,
  onDeleted,
}: {
  question: Question;
  index: number;
  topic: string | null;
  onEdit: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/questions/${question.id}`, { method: "DELETE" });
      await onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить вопрос");
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border-[1.5px] border-line bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          {topic && <p className="text-sm text-muted">{topic}</p>}
          <p className="font-semibold leading-snug">
            {index + 1}. {question.text}
          </p>
          {hasTj(question) ? (
            <p lang="tg" className="mt-1 leading-snug text-muted">
              {question.textTj}
            </p>
          ) : (
            <span className="mt-1.5 inline-block rounded-full bg-sun-soft px-2.5 py-0.5 text-[13px] font-semibold text-[#7a4f00]">
              Без таджикского перевода
            </span>
          )}
        </div>
        {confirm ? (
          <div className="flex gap-2">
            <button className="btn btn-soft btn-sm" onClick={() => setConfirm(false)}>
              Отмена
            </button>
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={remove}>
              Удалить
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button className="btn btn-soft btn-sm" onClick={onEdit}>
              Изменить
            </button>
            <button className="btn btn-soft btn-sm !px-2.5" aria-label="Удалить вопрос" onClick={() => setConfirm(true)}>
              <TrashIcon className="size-4" />
            </button>
          </div>
        )}
      </div>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {question.options.map((option, i) => (
          <li
            key={i}
            className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[15px] ${
              i === question.correct ? "bg-green-soft font-semibold text-green-edge" : "text-muted"
            }`}
          >
            {i === question.correct ? <CheckIcon className="mt-0.5 size-4 flex-none" /> : <span className="w-4 flex-none">{LETTERS[i]}</span>}
            <span>
              {option}
              {question.optionsTj?.[i] && question.optionsTj[i] !== option && (
                <span lang="tg" className="block font-normal opacity-75">
                  {question.optionsTj[i]}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {question.explanation && (
        <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-sm leading-relaxed text-muted">
          Пояснение: {question.explanation}
          {question.explanationTj && (
            <span lang="tg" className="mt-1 block">
              {question.explanationTj}
            </span>
          )}
        </p>
      )}
      <p className="sr-only">
        {question.options.length} {plural(question.options.length, ["вариант", "варианта", "вариантов"])}
      </p>
      {error && (
        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </li>
  );
}

const BULK_EXAMPLE = `# Урок 8. HTML
? Какой тег делает ссылку?
+ <a>
- <p>
- <img>
- <div>
! Тег a — от английского anchor, «якорь».

? Какой тег вставляет картинку?
+ <img>
- <a>
- <h1>
- <ul>`;

// Сразу много вопросов: вставить текст → проверить → добавить одним нажатием
function BulkImport({
  topics,
  defaultTopicId,
  onCancel,
  onImported,
}: {
  topics: Topic[];
  defaultTopicId: number | null;
  onCancel: () => void;
  onImported: (message: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [topicId, setTopicId] = useState<number | null>(defaultTopicId);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = parseQuestions(text);
  const needsTopic = parsed.questions.some((q) => !q.topic);
  const newTopics = [
    ...new Set(
      parsed.questions
        .map((q) => q.topic)
        .filter((title): title is string => Boolean(title))
        .filter((title) => !topics.some((t) => t.title.trim().toLowerCase() === title.toLowerCase())),
    ),
  ];
  const ready = parsed.questions.length > 0 && parsed.errors.length === 0 && (!needsTopic || topicId !== null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ added: number; createdTopics: string[] }>("/api/admin/questions/bulk", {
        method: "POST",
        body: { topicId, questions: parsed.questions },
      });
      const topicsNote = result.createdTopics.length ? `, новые темы: ${result.createdTopics.join(", ")}` : "";
      await onImported(
        `Добавлено ${result.added} ${plural(result.added, ["вопрос", "вопроса", "вопросов"])}${topicsNote}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel space-y-4 border-cobalt p-5 shadow-[0_4px_0_var(--color-cobalt-soft)]">
      <h3 className="font-display text-lg font-bold">Добавить вопросы списком</h3>
      <div className="rounded-xl bg-paper px-4 py-3 text-[15px] leading-relaxed">
        <p>
          Каждый вопрос — отдельным блоком, между вопросами пустая строка. <b>+</b> — правильный ответ, <b>-</b> —
          неправильные, <b>!</b> — пояснение (можно не писать). Строка <b># Название</b> задаёт тему для вопросов
          ниже; если такой темы нет, она создастся. Таджикский перевод потом можно добавить в каждом вопросе через
          «Изменить».
        </p>
        <button type="button" className="mt-2 font-semibold text-cobalt" onClick={() => setText(BULK_EXAMPLE)}>
          Вставить пример
        </button>
      </div>
      <textarea
        aria-label="Вопросы списком"
        className="input min-h-72 resize-y font-mono text-[15px] leading-relaxed"
        placeholder={BULK_EXAMPLE}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      {needsTopic && (
        <div>
          <label className="label" htmlFor="bulk-topic">
            Тема для вопросов без строки «#»
          </label>
          <select
            id="bulk-topic"
            className="input"
            value={topicId ?? ""}
            onChange={(e) => setTopicId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Выберите тему</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {text.trim() && (
        <p className="text-[15px]">
          Найдено: <b>{parsed.questions.length}</b> {plural(parsed.questions.length, ["вопрос", "вопроса", "вопросов"])}
          {newTopics.length > 0 && <>, новые темы: {newTopics.join(", ")}</>}
        </p>
      )}
      {parsed.errors.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-xl bg-red-soft px-3.5 py-2.5 text-[15px] font-medium text-red-edge">
          {parsed.errors.slice(0, 10).map((message) => (
            <li key={message}>{message}</li>
          ))}
          {parsed.errors.length > 10 && <li>…и ещё {parsed.errors.length - 10}</li>}
        </ul>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-3">
        <button className="btn btn-primary" disabled={busy || !ready}>
          {busy ? <Spinner /> : null} Добавить {parsed.questions.length || ""}
        </button>
        <button type="button" className="btn btn-soft" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}

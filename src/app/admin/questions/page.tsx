"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { CheckIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { ErrorText, Spinner } from "@/components/ui";
import { api, plural } from "@/lib/client";
import type { Question, Topic } from "@/lib/types";

const LETTERS = ["А", "Б", "В", "Г", "Д", "Е"];

type Draft = { id?: string; topicId: number; text: string; options: string[]; correct: number };

export default function QuestionsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [topicId, setTopicId] = useState<number | null>(null); // null — все темы
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

  const visible = (questions ?? []).filter((q) => topicId === null || q.topicId === topicId);
  const topicTitle = (id: number) => topics.find((t) => t.id === id)?.title ?? "";

  function newDraft() {
    setDraft({ topicId: topicId ?? topics.at(-1)?.id ?? 0, text: "", options: ["", "", "", ""], correct: 0 });
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
        <NewTopic
          onCreated={async (id) => {
            await load();
            setTopicId(id);
          }}
        />
        {topicId !== null && topics.find((t) => t.id === topicId)?.questionCount === 0 && (
          <DeleteTopic
            id={topicId}
            onDeleted={async () => {
              setTopicId(null);
              await load();
            }}
          />
        )}
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold">
            {topicId === null ? "Все вопросы" : topicTitle(topicId)}
            <span className="text-muted"> {visible.length}</span>
          </h2>
          <button className="btn btn-primary btn-sm" onClick={newDraft} disabled={topics.length === 0}>
            <PlusIcon className="size-4" /> Добавить вопрос
          </button>
        </div>
        <ErrorText>{error}</ErrorText>

        {draft && (
          <Editor
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
          <p className="text-muted">В этой теме пока нет вопросов.</p>
        ) : (
          <ol className="space-y-3">
            {visible.map((question, index) => (
              <QuestionCard
                key={question.id}
                index={index}
                question={question}
                topic={topicId === null ? topicTitle(question.topicId) : null}
                onEdit={() => {
                  setDraft({ ...question, options: [...question.options] });
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
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const { id } = await api<{ id: number }>("/api/admin/topics", { method: "POST", body: { title } });
      setTitle("");
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
      <div className="flex gap-2">
        <input
          id="topic"
          className="input"
          placeholder="Урок 8. …"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn btn-soft !px-3" aria-label="Добавить тему" disabled={!title.trim()}>
          <PlusIcon />
        </button>
      </div>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

function DeleteTopic({ id, onDeleted }: { id: number; onDeleted: () => Promise<void> }) {
  return (
    <button
      className="btn btn-danger btn-sm"
      onClick={async () => {
        await api(`/api/admin/topics/${id}`, { method: "DELETE" }).catch(() => {});
        await onDeleted();
      }}
    >
      <TrashIcon className="size-4" /> Удалить пустую тему
    </button>
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

  const setOption = (index: number, value: string) =>
    setDraft({ ...draft, options: draft.options.map((option, i) => (i === index ? value : option)) });

  function removeOption(index: number) {
    const options = draft.options.filter((_, i) => i !== index);
    const correct = draft.correct === index ? 0 : draft.correct > index ? draft.correct - 1 : draft.correct;
    setDraft({ ...draft, options, correct });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = { topicId: draft.topicId, text: draft.text, options: draft.options, correct: draft.correct };
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
      <h3 className="font-display text-lg font-bold">{draft.id ? "Изменить вопрос" : "Новый вопрос"}</h3>
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
      <div>
        <label className="label" htmlFor="q-text">
          Вопрос
        </label>
        <textarea
          id="q-text"
          className="input min-h-24 resize-y leading-relaxed"
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          required
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="label">Варианты ответа: отметьте правильный</legend>
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
            <input
              className="input"
              value={option}
              placeholder={`Вариант ${LETTERS[index]}`}
              onChange={(e) => setOption(index, e.target.value)}
              aria-label={`Вариант ${LETTERS[index]}`}
            />
            {draft.options.length > 2 && (
              <button type="button" className="btn btn-soft !px-3" aria-label="Убрать вариант" onClick={() => removeOption(index)}>
                <TrashIcon className="size-4" />
              </button>
            )}
          </div>
        ))}
        {draft.options.length < 6 && (
          <button type="button" className="text-[15px] font-semibold text-cobalt" onClick={() => setDraft({ ...draft, options: [...draft.options, ""] })}>
            + ещё вариант
          </button>
        )}
      </fieldset>
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
  return (
    <li className="rounded-2xl border-[1.5px] border-line bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          {topic && <p className="text-sm text-muted">{topic}</p>}
          <p className="font-semibold leading-snug">
            {index + 1}. {question.text}
          </p>
        </div>
        {confirm ? (
          <div className="flex gap-2">
            <button className="btn btn-soft btn-sm" onClick={() => setConfirm(false)}>
              Отмена
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={async () => {
                await api(`/api/admin/questions/${question.id}`, { method: "DELETE" }).catch(() => {});
                await onDeleted();
              }}
            >
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
            {option}
          </li>
        ))}
      </ul>
      <p className="sr-only">
        {question.options.length} {plural(question.options.length, ["вариант", "варианта", "вариантов"])}
      </p>
    </li>
  );
}

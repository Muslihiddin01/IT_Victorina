"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { ErrorText, Spinner } from "@/components/ui";
import { api, formatDate, plural } from "@/lib/client";
import type { Room, Topic } from "@/lib/types";

const DURATIONS = [10, 20, 30];

const STATUS: Record<Room["status"], { label: string; className: string }> = {
  waiting: { label: "Ждёт начала", className: "bg-sun-soft text-[#7a4f00]" },
  running: { label: "Идёт тест", className: "bg-green-soft text-green-edge" },
  finished: { label: "Завершён", className: "bg-paper text-muted" },
};

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);

  useEffect(() => {
    Promise.all([api<{ rooms: Room[] }>("/api/admin/rooms"), api<{ topics: Topic[] }>("/api/admin/questions")])
      .then(([roomData, questionData]) => {
        setRooms(roomData.rooms);
        setTopics(questionData.topics);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
      <NewRoom topics={topics} />
      <section>
        <h2 className="font-display text-xl font-bold">Комнаты</h2>
        {!rooms ? (
          <div className="mt-6 text-cobalt">
            <Spinner />
          </div>
        ) : rooms.length === 0 ? (
          <p className="mt-4 text-muted">Пока нет ни одной комнаты. Создайте первую слева.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border-[1.5px] border-line bg-white">
            {rooms.map((room) => (
              <li key={room.id}>
                <Link
                  href={`/admin/room?id=${room.id}`}
                  className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-paper"
                >
                  <span className="font-display text-lg font-bold tracking-wider text-cobalt">{room.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{room.title}</span>
                    <span className="block text-sm text-muted">
                      {formatDate(room.createdAt)}, {room.participants}{" "}
                      {plural(room.participants, ["ученик", "ученика", "учеников"])}, сдали {room.submitted}
                    </span>
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[room.status].className}`}>
                    {STATUS[room.status].label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NewRoom({ topics }: { topics: Topic[] }) {
  const [title, setTitle] = useState("Тест по пройденным темам");
  const [duration, setDuration] = useState(10);
  const [custom, setCustom] = useState(false);
  const [count, setCount] = useState(20);
  const [selected, setSelected] = useState<number[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const chosen = selected ?? topics.map((t) => t.id);
  const available = topics.filter((t) => chosen.includes(t.id)).reduce((sum, t) => sum + t.questionCount, 0);

  function toggle(id: number) {
    setSelected(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const room = await api<{ id: string }>("/api/admin/rooms", {
        method: "POST",
        body: { title, durationMin: duration, questionCount: count, topicIds: chosen },
      });
      router.push(`/admin/room?id=${room.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} className="panel h-fit space-y-5 p-5">
      <h1 className="font-display text-xl font-bold">Новая комната</h1>

      <div>
        <label className="label" htmlFor="title">
          Название
        </label>
        <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <fieldset>
        <legend className="label">Время на тест</legend>
        <div className="grid grid-cols-4 gap-2">
          {DURATIONS.map((minutes) => (
            <button
              type="button"
              key={minutes}
              onClick={() => {
                setDuration(minutes);
                setCustom(false);
              }}
              className={`btn btn-sm !min-h-11 ${!custom && duration === minutes ? "btn-primary" : "btn-soft"}`}
            >
              {minutes} мин
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustom(true)}
            className={`btn btn-sm !min-h-11 ${custom ? "btn-primary" : "btn-soft"}`}
          >
            Своё
          </button>
        </div>
        {custom && (
          <div className="mt-2 flex items-center gap-2">
            <input
              className="input !w-28"
              type="number"
              min={1}
              max={180}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              aria-label="Минут"
            />
            <span className="text-muted">минут</span>
          </div>
        )}
      </fieldset>

      <div>
        <label className="label" htmlFor="count">
          Вопросов в тесте
        </label>
        <input
          id="count"
          className="input !w-28"
          type="number"
          min={1}
          max={100}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </div>

      <fieldset>
        <legend className="label">Темы (вопросы перемешаются)</legend>
        <div className="space-y-1.5">
          {topics.map((topic) => (
            <label key={topic.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1 hover:bg-paper">
              <input
                type="checkbox"
                className="size-5 accent-[var(--color-cobalt)]"
                checked={chosen.includes(topic.id)}
                onChange={() => toggle(topic.id)}
              />
              <span className="flex-1 text-[15px]">{topic.title}</span>
              <span className="text-sm text-muted">{topic.questionCount}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">
          В выбранных темах {available} {plural(available, ["вопрос", "вопроса", "вопросов"])}
          {available < count ? ` — в тесте будет ${available}` : ""}.
        </p>
      </fieldset>

      <ErrorText>{error}</ErrorText>
      <button className="btn btn-primary w-full" disabled={busy || chosen.length === 0}>
        {busy ? <Spinner /> : null} Создать комнату
      </button>
    </form>
  );
}

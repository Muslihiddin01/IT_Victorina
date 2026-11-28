"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { ErrorText, Spinner } from "@/components/ui";
import { api, formatDate, plural } from "@/lib/client";
import type { Room, RoomKind, Topic } from "@/lib/types";
import { TYPING_SECONDS, type TypingSeconds } from "@/lib/typing";

const DURATIONS = [10, 20, 30];

const STATUS: Record<Room["status"], { label: string; className: string }> = {
  waiting: { label: "Ждёт начала", className: "bg-sun-soft text-[#7a4f00]" },
  running: { label: "Идёт тест", className: "bg-green-soft text-green-edge" },
  finished: { label: "Завершён", className: "bg-paper text-muted" },
};

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<{ rooms: Room[] }>("/api/admin/rooms"), api<{ topics: Topic[] }>("/api/admin/questions")])
      .then(([roomData, questionData]) => {
        setRooms(roomData.rooms);
        setTopics(questionData.topics);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Не удалось загрузить комнаты"));
  }, []);

  return (
    <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
      <NewRoom topics={topics} />
      <section>
        <h2 className="font-display text-xl font-bold">Комнаты</h2>
        {error ? (
          <div className="mt-4">
            <ErrorText>{error}</ErrorText>
          </div>
        ) : !rooms ? (
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
                    <span className="block truncate font-semibold">
                      {room.kind === "typing" && (
                        <span className="mr-2 rounded-md bg-cobalt-soft px-1.5 py-0.5 text-xs font-bold text-cobalt">
                          Печатание
                        </span>
                      )}
                      {room.title}
                    </span>
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
  const [kind, setKind] = useState<RoomKind>("quiz");
  const [typingSec, setTypingSec] = useState<TypingSeconds>(60);
  const [title, setTitle] = useState("Тест по пройденным темам");
  // Числа храним как текст: так поле можно очистить и спокойно ввести своё значение
  const [durationText, setDurationText] = useState("10");
  const [custom, setCustom] = useState(false);
  const [countText, setCountText] = useState("20");
  const duration = Number(durationText) || 0;
  const count = Number(countText) || 0;
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
    if (busy) return; // Enter в поле, пока комната уже создаётся
    if (kind === "typing") {
      setBusy(true);
      setError("");
      try {
        const room = await api<{ id: string }>("/api/admin/rooms", {
          method: "POST",
          body: { kind, title, typingSec },
        });
        router.push(`/admin/room?id=${room.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
        setBusy(false);
      }
      return;
    }
    if (duration < 1 || duration > 180) return setError("Время теста — от 1 до 180 минут");
    if (count < 1 || count > 100) return setError("Вопросов в тесте — от 1 до 100");
    setBusy(true);
    setError("");
    try {
      const room = await api<{ id: string }>("/api/admin/rooms", {
        method: "POST",
        body: {
          title,
          durationMin: duration,
          questionCount: count,
          topicIds: chosen,
        },
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

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-line/70 p-1">
        {(
          [
            ["quiz", "Тест с вопросами"],
            ["typing", "Печатание"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={kind === value}
            onClick={() => {
              setKind(value);
              setTitle(value === "typing" ? "Печатание на скорость" : "Тест по пройденным темам");
            }}
            className={`rounded-xl px-3 py-2 text-[15px] transition ${
              kind === value
                ? "bg-white font-bold text-ink shadow-[0_2px_0_var(--color-line)]"
                : "font-semibold text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="title">
          Название
        </label>
        <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      {kind === "typing" ? (
        <>
          <fieldset>
            <legend className="label">Сколько печатать</legend>
            <div className="grid grid-cols-2 gap-2">
              {TYPING_SECONDS.map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setTypingSec(value)}
                  className={`btn btn-sm !min-h-11 ${typingSec === value ? "btn-primary" : "btn-soft"}`}
                >
                  {value} секунд
                </button>
              ))}
            </div>
          </fieldset>
          <p className="text-[15px] leading-relaxed text-muted">
            Ученики печатают английские слова — у всех одинаковые. Таймер каждого запускается с его первой буквы,
            попытка одна. В таблице будет скорость: сколько слов в минуту.
          </p>
        </>
      ) : (
        <>
          <fieldset>
            <legend className="label">Время на тест</legend>
            <div className="grid grid-cols-4 gap-2">
              {DURATIONS.map((minutes) => (
                <button
                  type="button"
                  key={minutes}
                  onClick={() => {
                    setDurationText(String(minutes));
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
                <NumberInput value={durationText} onChange={setDurationText} label="Минут" />
                <span className="text-muted">минут</span>
              </div>
            )}
          </fieldset>

          <div>
            <label className="label" htmlFor="count">
              Вопросов в тесте
            </label>
            <NumberInput id="count" value={countText} onChange={setCountText} />
          </div>

          <fieldset>
            <legend className="label">Темы (вопросы перемешаются)</legend>
            <div className="space-y-1.5">
              {topics.map((topic) => (
                <label
                  key={topic.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1 hover:bg-paper"
                >
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
        </>
      )}

      <ErrorText>{error}</ErrorText>
      <button className="btn btn-primary w-full" disabled={busy || (kind === "quiz" && available === 0)}>
        {busy ? <Spinner /> : null} Создать комнату
      </button>
    </form>
  );
}

// Поле для числа: только цифры, можно стереть всё и ввести заново (без «01»)
function NumberInput({
  id,
  value,
  onChange,
  label,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <input
      id={id}
      className="input !w-28"
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 3))}
    />
  );
}

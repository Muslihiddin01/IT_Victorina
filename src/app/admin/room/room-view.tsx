"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { CheckIcon, DownloadIcon, LeaveIcon, TrashIcon, UsersIcon, WifiIcon } from "@/components/icons";
import { ErrorText, Keycaps, Spinner } from "@/components/ui";
import { api, formatClock, formatSeconds, formatTimer, plural } from "@/lib/client";
import type { Participant, RoomDetail } from "@/lib/types";

export function RoomView() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const [data, setData] = useState<RoomDetail | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"finish" | "delete" | null>(null);

  const load = useCallback(async () => {
    try {
      const detail = await api<RoomDetail>(`/api/admin/rooms/${id}`);
      setData(detail);
      setOffset(detail.serverNow - Date.now());
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

  async function act(action: "start" | "finish") {
    setBusy(true);
    try {
      await api(`/api/admin/rooms/${id}`, { method: "PATCH", body: { action } });
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

  const { room, participants } = data;
  const serverNow = now + offset;
  const remaining = room.endsAt ? room.endsAt - serverNow : 0;
  const submitted = participants.filter((p) => p.submittedAt);
  const loaded = participants.filter((p) => p.loadedAt);
  const average = submitted.length
    ? Math.round(
        (submitted.reduce((sum, p) => sum + (p.score ?? 0) / (p.total || 1), 0) / submitted.length) * 100,
      )
    : null;
  const host = typeof window !== "undefined" ? window.location.host : "";

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
          <p className="text-lg text-white/80">Код комнаты</p>
          <Keycaps value={room.code} className="mt-4 text-[56px] sm:text-[88px]" />
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-white/90">
            Ученикам: откройте <b className="text-white">{host}</b>, войдите под своим логином и введите этот код.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button className="btn btn-white text-lg" disabled={busy} onClick={() => act("start")}>
              {busy ? <Spinner /> : null} Начать тест
            </button>
            <span className="text-white/85">
              {room.questionCount} {plural(room.questionCount, ["вопрос", "вопроса", "вопросов"])}, {room.durationMin}{" "}
              {plural(room.durationMin, ["минута", "минуты", "минут"])}
            </span>
          </div>
        </section>
      )}

      {room.status === "running" && (
        <section className="flex flex-wrap items-center gap-x-10 gap-y-5 rounded-[28px] bg-white p-6 shadow-[0_4px_0_var(--color-line)]">
          <div>
            <p className="text-muted">Осталось</p>
            <p className={`font-display text-[44px] font-bold tabular-nums leading-tight ${remaining < 60_000 ? "text-red" : "text-ink"}`}>
              {remaining > 0 ? formatTimer(remaining) : "0:00"}
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
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="В комнате" value={participants.length} />
        <Stat label="Скачали тест" value={loaded.length} />
        <Stat label="Сдали" value={submitted.length} />
        <Stat label="Средний результат" value={average === null ? "—" : `${average}%`} />
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Ученики</h2>
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-soft btn-sm" href={`/api/admin/rooms/${room.id}/export`} download>
              <DownloadIcon className="size-4" /> Скачать результаты (Excel)
            </a>
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
                  <th className="px-4 py-3 font-semibold">Баллы</th>
                  <th className="px-4 py-3 font-semibold">Нарушения</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {participants.map((p) => (
                  <Row key={p.id} p={p} roomStatus={room.status} endsAt={room.endsAt} serverNow={serverNow} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
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
  endsAt,
  serverNow,
}: {
  p: Participant;
  roomStatus: RoomDetail["room"]["status"];
  endsAt: number | null;
  serverNow: number;
}) {
  const fresh = p.lastEventAt !== null && serverNow - p.lastEventAt < 15_000 && !p.submittedAt;
  const late = endsAt !== null && p.finishedAt !== null && p.finishedAt > endsAt + 30_000;
  const connected = serverNow - p.lastSeenAt < 8_000;

  let status: ReactNode;
  if (p.submittedAt) {
    status = (
      <span className="inline-flex items-center gap-1.5 font-semibold text-green-edge">
        <CheckIcon className="size-4" /> Сдал в {formatClock(p.finishedAt)}
        {late && <span className="font-normal text-red-edge">, позже времени</span>}
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
    <tr className={fresh ? "bg-sun-soft" : undefined}>
      <td className="px-4 py-3">
        <p className="font-semibold">{p.name}</p>
        <p className="text-sm text-muted">{p.login}</p>
      </td>
      <td className="px-4 py-3">{status}</td>
      <td className="px-4 py-3">
        {p.score !== null && p.total ? (
          <span>
            <b className="font-display text-lg">{p.score}</b>
            <span className="text-muted">
              /{p.total}, {Math.round((p.score / p.total) * 100)}%
            </span>
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {flags.length ? <div className="flex flex-wrap gap-1.5">{flags}</div> : <span className="text-muted">Нет</span>}
      </td>
    </tr>
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

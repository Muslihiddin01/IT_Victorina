"use client";

import { useEffect, useState, type FormEvent } from "react";

import { ErrorText, FullScreenLoader, Logo, Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import {
  clearCurrent,
  savePendingCode,
  setCurrent,
  takePendingCode,
  unfinishedTest,
  type Current,
} from "@/lib/test-storage";
import type { Me } from "@/lib/types";

// Войти в комнату и открыть тест
async function enterRoom(user: Me, code: string) {
  const room = await api<{ roomId: string; title: string }>("/api/rooms/join", {
    method: "POST",
    body: { code },
  });
  setCurrent({ roomId: room.roomId, userId: user.id, name: user.name, title: room.title });
  // Полная загрузка страницы — чтобы браузер сохранил страницу теста для работы без интернета
  window.location.assign("/test");
}

export default function JoinPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [unfinished, setUnfinished] = useState<Current | null>(null);

  useEffect(() => {
    // Пришли по QR-коду: /join?code=1234. Запоминаем код — он понадобится и после входа в аккаунт.
    const fromLink = new URLSearchParams(window.location.search).get("code");
    if (fromLink) {
      savePendingCode(fromLink);
      window.history.replaceState(null, "", "/join");
    }

    api<{ user: Me | null }>("/api/me")
      .then(({ user }) => {
        if (!user) window.location.replace("/login");
        else if (user.role === "admin") window.location.replace("/admin");
        else {
          setMe(user);
          setUnfinished(unfinishedTest(user.id));
          const pending = takePendingCode();
          if (pending) {
            setCode(pending);
            setBusy(true);
            enterRoom(user, pending).catch((e) => {
              setError(e instanceof Error ? e.message : "Ошибка");
              setBusy(false);
            });
          }
        }
      })
      .catch(() => setError("Нет связи с сервером. Проверьте интернет."));
  }, []);

  async function join(event: FormEvent) {
    event.preventDefault();
    if (!me) return;
    setBusy(true);
    setError("");
    try {
      await enterRoom(me, code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setBusy(false);
    }
  }

  async function logout() {
    // На общем компьютере следующий ученик не должен попасть в чужой тест.
    // Сами ответы остаются на устройстве и найдутся, когда этот ученик войдёт снова.
    clearCurrent();
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/login");
  }

  if (!me && !error) return <FullScreenLoader />;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-5 pb-10 pt-5">
      <header className="flex items-center justify-between">
        <Logo />
        <button className="text-[15px] font-semibold text-muted hover:text-ink" onClick={logout}>
          Выйти
        </button>
      </header>

      <div className="flex flex-1 flex-col justify-center py-8">
        {me && <p className="text-lg text-muted">Привет, {me.name}!</p>}
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight">Код комнаты</h1>
        <p className="mt-2 text-lg leading-relaxed">Учитель покажет его на экране: 4 цифры.</p>

        {unfinished && (
          <a href="/test" className="btn btn-green mt-6 w-full text-lg">
            Вернуться к тесту «{unfinished.title}»
          </a>
        )}

        <form onSubmit={join} className="mt-6 space-y-4">
          <input
            className="input text-center font-display !text-[40px] font-bold tracking-[0.4em] !py-4"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="0000"
            aria-label="Код комнаты"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
          <ErrorText>{error}</ErrorText>
          <button className="btn btn-primary w-full text-lg" disabled={busy || code.length !== 4}>
            {busy ? <Spinner /> : null}
            Войти в комнату
          </button>
        </form>
      </div>
    </main>
  );
}

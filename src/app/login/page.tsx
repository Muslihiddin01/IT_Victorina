"use client";

import { useEffect, useState, type FormEvent } from "react";

import { ErrorText, Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import { unfinishedTest } from "@/lib/test-storage";
import type { Me } from "@/lib/types";

function goHome(user: Me) {
  if (user.role === "admin") window.location.assign("/admin");
  else window.location.assign(unfinishedTest(user.id) ? "/test" : "/join");
}

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adminReady, setAdminReady] = useState(true);

  // Уже вошёл — сразу дальше
  useEffect(() => {
    api<{ user: Me | null; adminReady: boolean }>("/api/me")
      .then(({ user, adminReady }) => {
        setAdminReady(adminReady);
        if (user) goHome(user);
      })
      .catch(() => {});
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { user } = await api<{ user: Me }>("/api/auth/login", { method: "POST", body: { login, password } });
      goHome(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка входа");
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col bg-cobalt">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-10">
        <div className="flex gap-3 text-[40px]" aria-hidden>
          <span className="keycap size-[1.75em] -rotate-6">I</span>
          <span className="keycap mt-3 size-[1.75em] rotate-[5deg]">T</span>
        </div>
        <h1 className="mt-8 font-display text-[34px] font-bold leading-tight text-white">Викторина</h1>
        <p className="mt-2 text-lg text-white/85">Войди под логином и паролем, которые дал учитель.</p>

        <form onSubmit={submit} className="mt-8 space-y-4 rounded-[22px] bg-white p-5 shadow-[0_6px_0_var(--color-cobalt-edge)]">
          <div>
            <label className="label" htmlFor="login">
              Логин
            </label>
            <input
              id="login"
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Пароль
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <ErrorText>{error}</ErrorText>
          <button className="btn btn-primary w-full text-lg" disabled={busy}>
            {busy ? <Spinner /> : null}
            Войти
          </button>
        </form>

        {!adminReady && (
          <p className="mt-6 rounded-xl bg-white/10 px-4 py-3 text-[15px] text-white">
            Админ не настроен: добавьте переменные ADMIN_LOGIN и ADMIN_PASSWORD в настройках сервера.
          </p>
        )}
      </div>
    </main>
  );
}

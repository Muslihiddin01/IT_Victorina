"use client";

import { Logo } from "@/components/ui";
import { api } from "@/lib/client";
import { LangSwitch, useLang } from "@/lib/i18n";
import { clearCurrent } from "@/lib/test-storage";

// Шапка для ученика: логотип, язык, выход и меню «Тест по коду | Тренировка».
// Во время самого теста её нет — там ничего не должно отвлекать.
export function StudentHeader({ active }: { active: "join" | "practice" }) {
  const { t } = useLang();

  async function logout() {
    // На общем компьютере следующий ученик не должен попасть в чужой тест.
    // Сами ответы остаются на устройстве и найдутся, когда этот ученик войдёт снова.
    clearCurrent();
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/login");
  }

  const tabs = [
    { key: "join", href: "/join", label: t.navTest },
    { key: "practice", href: "/practice", label: t.navPractice },
  ] as const;

  return (
    <header className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Logo compact />
        <div className="flex items-center gap-3">
          <LangSwitch />
          <button className="whitespace-nowrap text-[15px] font-semibold text-muted hover:text-ink" onClick={logout}>
            {t.logout}
          </button>
        </div>
      </div>
      <nav className="grid grid-cols-2 gap-1 rounded-2xl bg-line/70 p-1" aria-label="Меню">
        {tabs.map((tab) =>
          tab.key === active ? (
            <span
              key={tab.key}
              aria-current="page"
              className="rounded-xl bg-white px-3 py-2 text-center text-[15px] font-bold text-ink shadow-[0_2px_0_var(--color-line)]"
            >
              {tab.label}
            </span>
          ) : (
            // Обычная ссылка (полная загрузка): service worker сохранит страницу для работы без интернета
            <a
              key={tab.key}
              href={tab.href}
              className="rounded-xl px-3 py-2 text-center text-[15px] font-semibold text-muted transition hover:text-ink"
            >
              {tab.label}
            </a>
          ),
        )}
      </nav>
    </header>
  );
}

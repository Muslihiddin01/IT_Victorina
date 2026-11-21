"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, use, useEffect, useState, type ReactNode } from "react";

import { FullScreenLoader, Logo } from "@/components/ui";
import { api } from "@/lib/client";
import type { Me } from "@/lib/types";

const AdminContext = createContext<Me | null>(null);
export const useAdmin = () => use(AdminContext);

const LINKS = [
  { href: "/admin", label: "Комнаты" },
  { href: "/admin/students", label: "Ученики" },
  { href: "/admin/questions", label: "Вопросы" },
];

// Рамка админки: проверяем, что вошёл учитель, и показываем меню
export function AdminShell({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    api<{ user: Me | null }>("/api/me")
      .then(({ user }) => {
        if (!user) window.location.replace("/login");
        else if (user.role !== "admin") window.location.replace("/join");
        else setMe(user);
      })
      .catch(() => window.location.replace("/login"));
  }, []);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/login");
  }

  if (!me) return <FullScreenLoader />;

  return (
    <AdminContext value={me}>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/admin" className="py-1">
            <Logo label="Учитель" />
          </Link>
          <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {LINKS.map((link) => {
              const active = link.href === "/admin" ? pathname === "/admin" || pathname.startsWith("/admin/room") : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-2 text-[15px] font-semibold transition ${
                    active ? "bg-cobalt-soft text-cobalt" : "text-muted hover:bg-paper hover:text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-[15px]">
            <span className="hidden text-muted sm:inline">{me.name}</span>
            <button className="btn btn-soft btn-sm" onClick={logout}>
              Выйти
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </AdminContext>
  );
}

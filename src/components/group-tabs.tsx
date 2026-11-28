"use client";

import type { ReactNode } from "react";

import type { Group } from "@/lib/types";

// Последняя открытая группа — чтобы журнал и список учеников открывались на ней же
const KEY = "quiz:group";
export function loadGroup(): number | null | undefined {
  try {
    const value = localStorage.getItem(KEY);
    if (value === null) return undefined;
    return value === "none" ? null : Number(value);
  } catch {
    return undefined;
  }
}
export function saveGroup(id: number | null) {
  try {
    localStorage.setItem(KEY, id === null ? "none" : String(id));
  } catch {}
}

// Вкладки групп. «Без группы» показываем, только если там кто-то есть.
export function GroupTabs({
  groups,
  value,
  onChange,
  ungrouped = 0,
  children,
}: {
  groups: Group[];
  value: number | null;
  onChange: (id: number | null) => void;
  ungrouped?: number;
  children?: ReactNode;
}) {
  const tab = (id: number | null, label: string, count: number) => (
    <button
      key={id ?? "none"}
      className={`btn btn-sm ${value === id ? "btn-primary" : "btn-soft"}`}
      aria-pressed={value === id}
      onClick={() => {
        saveGroup(id);
        onChange(id);
      }}
    >
      {label} <span className={value === id ? "text-white/75" : "text-muted"}>{count}</span>
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {groups.map((group) => tab(group.id, group.name, group.students))}
      {ungrouped > 0 && tab(null, "Без группы", ungrouped)}
      {children}
    </div>
  );
}

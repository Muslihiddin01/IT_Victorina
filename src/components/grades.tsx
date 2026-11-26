"use client";

import { useEffect, useState } from "react";

import { DEFAULT_GRADES, GRADE_KEYS, gradeColor, loadGrades, saveGrades, validGrades, type Grades } from "@/lib/grades";

// Пороги оценок этого браузера. Пока учитель печатает, пороги могут быть «неправильными» —
// тогда оценки считаются по последним правильным.
export function useGrades() {
  const [draft, setDraft] = useState<Grades>(DEFAULT_GRADES);
  const [grades, setGrades] = useState<Grades>(DEFAULT_GRADES);

  useEffect(() => {
    const saved = loadGrades();
    // localStorage есть только в браузере, поэтому читаем его после первой отрисовки
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(saved);
    setGrades(saved);
  }, []);

  const change = (key: keyof Grades, value: string) => {
    const next = { ...draft, [key]: Number(value.replace(/\D/g, "").slice(0, 3)) };
    setDraft(next);
    if (validGrades(next)) {
      setGrades(next);
      saveGrades(next);
    }
  };
  const reset = () => {
    setDraft(DEFAULT_GRADES);
    setGrades(DEFAULT_GRADES);
    saveGrades(DEFAULT_GRADES);
  };

  return { grades, draft, ok: validGrades(draft), change, reset };
}

export function GradeBadge({ grade, className = "" }: { grade: number; className?: string }) {
  return (
    <span
      className={`inline-grid size-8 flex-none place-items-center rounded-lg font-display text-base font-bold ${gradeColor(grade)} ${className}`}
      title={`Оценка ${grade}`}
    >
      {grade}
    </span>
  );
}

// Окошко «С какого процента ставить оценку»
export function GradesEditor({ state, note }: { state: ReturnType<typeof useGrades>; note?: string }) {
  const { draft, ok, change, reset } = state;
  return (
    <div className="w-72 rounded-2xl border-[1.5px] border-line bg-white p-4 shadow-[0_6px_0_var(--color-line)]">
      <p className="text-sm font-semibold">С какого процента ставить оценку</p>
      <div className="mt-3 space-y-2">
        {GRADE_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-3 text-[15px]">
            <span className="w-16 font-display font-bold">«{key.slice(1)}» от</span>
            <input
              className="input !min-h-0 !w-20 !py-1.5 text-center"
              inputMode="numeric"
              value={draft[key] || ""}
              onChange={(e) => change(key, e.target.value)}
            />
            %
          </label>
        ))}
        <p className="text-[15px] text-muted">«0» — меньше порога «1»</p>
      </div>
      {!ok && (
        <p className="mt-2 text-sm font-medium text-red-edge">Пороги должны идти по убыванию: 5 &gt; 4 &gt; 3 &gt; 2 &gt; 1</p>
      )}
      <button className="mt-3 text-sm font-semibold text-cobalt" onClick={reset}>
        Вернуть обычные ({GRADE_KEYS.map((key) => DEFAULT_GRADES[key]).join("/")})
      </button>
      {note && <p className="mt-2 text-sm leading-relaxed text-muted">{note}</p>}
    </div>
  );
}

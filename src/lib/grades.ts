// Оценка по проценту правильных ответов: 5, 4, 3, 2, 1, а кто не набрал даже на «1» — 0.
// Пороги учитель может поменять (сохраняются в браузере); в Excel они стоят в жёлтых ячейках.
// Общий файл для сервера и браузера.

export const GRADE_KEYS = ["g5", "g4", "g3", "g2", "g1"] as const;
export type GradeKey = (typeof GRADE_KEYS)[number];
export type Grades = Record<GradeKey, number>; // проценты, например { g5: 85, … }

// Для теста из 20 вопросов: «5» — от 17, «4» — от 14, «3» — от 10, «2» — от 6, «1» — от 3, меньше 3 — «0»
export const DEFAULT_GRADES: Grades = { g5: 85, g4: 70, g3: 50, g2: 30, g1: 15 };

export function validGrades(g: Partial<Grades>): g is Grades {
  const values = GRADE_KEYS.map((key) => g[key]);
  return (
    values.every((n) => Number.isInteger(n) && n! >= 1 && n! <= 100) &&
    values.every((n, i) => i === 0 || n! < values[i - 1]!)
  );
}

// part — доля от 0 до 1 (7 из 10 → 0.7)
export function gradeOf(part: number, g: Grades = DEFAULT_GRADES): number {
  // Сравниваем в процентах с округлением, чтобы 0.7 (7 из 10) точно попало в «от 70 %»
  const percent = Math.round(part * 10000) / 100;
  for (const [i, key] of GRADE_KEYS.entries()) {
    if (percent >= g[key]) return 5 - i;
  }
  return 0;
}

const STORAGE_KEY = "quiz:grades";

// Пороги из браузера. Старые сохранения (только 5/4/3) дополняются обычными порогами.
export function loadGrades(): Grades {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Grades> | null;
    const merged = { ...DEFAULT_GRADES, ...saved };
    if (saved && validGrades(merged)) return merged;
  } catch {}
  return DEFAULT_GRADES;
}

export function saveGrades(g: Grades) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(g));
  } catch {}
}

// Цвет оценки в таблицах (классы Tailwind)
export function gradeColor(grade: number) {
  if (grade >= 5) return "bg-green-soft text-green-edge";
  if (grade === 4) return "bg-cobalt-soft text-cobalt-edge";
  if (grade === 3) return "bg-sun-soft text-[#8a5a00]";
  return "bg-red-soft text-red-edge";
}

import "server-only";

import { randomInt } from "node:crypto";

// Логин из имени: «Алиев Фаррух» → «aliev.farrukh» (русские и таджикские буквы)
const MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", ғ: "gh", д: "d", е: "e", ё: "yo", ж: "zh", з: "z",
  и: "i", ӣ: "i", й: "y", к: "k", қ: "q", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ӯ: "u", ф: "f", х: "kh", ҳ: "h", ц: "ts", ч: "ch",
  ҷ: "j", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function loginFromName(name: string) {
  const latin = name
    .toLowerCase()
    .split("")
    .map((char) => MAP[char] ?? char)
    .join("");
  const words = latin
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  return words.slice(0, 2).join(".") || "student";
}

// Простой пароль из 6 цифр — детям легко ввести на телефоне
export function generatePassword() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function validLogin(login: string) {
  return /^[a-z0-9._-]{3,32}$/.test(login);
}

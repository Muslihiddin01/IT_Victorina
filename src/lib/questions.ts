import "server-only";

import { HttpError } from "./http";

export type QuestionInput = {
  topicId?: number;
  text?: string;
  options?: string[];
  correct?: number;
  explanation?: string;
  textTj?: string;
  optionsTj?: string[];
  explanationTj?: string;
};

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

// Проверка вопроса перед сохранением.
// Варианты на двух языках идут парами: вариант №2 по-русски = вариант №2 по-таджикски.
// Пустые варианты убираются сразу на обоих языках, чтобы пары не разъехались.
export function cleanQuestion(input: QuestionInput) {
  const text = str(input.text);
  const textTj = str(input.textTj);
  const explanation = str(input.explanation);
  const explanationTj = str(input.explanationTj);
  const rows = (Array.isArray(input.options) ? input.options : []).map((option, index) => ({
    ru: str(option),
    tj: Array.isArray(input.optionsTj) ? str(input.optionsTj[index]) : "",
    correct: index === input.correct,
  }));
  const kept = rows.filter((row) => row.ru);
  const options = kept.map((row) => row.ru);
  const correct = kept.findIndex((row) => row.correct);

  if (text.length < 3) throw new HttpError(400, "Напишите текст вопроса");
  if (text.length > 600 || textTj.length > 600) throw new HttpError(400, "Вопрос слишком длинный");
  if (options.length < 2) throw new HttpError(400, "Нужно хотя бы 2 варианта ответа");
  if (options.length > 6) throw new HttpError(400, "Максимум 6 вариантов ответа");
  if (kept.some((row) => row.ru.length > 300 || row.tj.length > 300)) {
    throw new HttpError(400, "Вариант ответа слишком длинный (до 300 символов)");
  }
  if (new Set(options).size !== options.length) throw new HttpError(400, "Варианты ответа не должны повторяться");
  if (correct < 0) throw new HttpError(400, "Отметьте правильный ответ");
  if (explanation.length > 600 || explanationTj.length > 600) {
    throw new HttpError(400, "Пояснение слишком длинное (до 600 символов)");
  }
  if (!Number.isInteger(input.topicId)) throw new HttpError(400, "Выберите тему");

  // Перевод необязателен, но если начали — нужен целиком (вопрос и все варианты)
  const anyTj = Boolean(textTj || kept.some((row) => row.tj));
  let optionsTj: string[] | null = null;
  if (anyTj) {
    optionsTj = kept.map((row) => row.tj);
    if (!textTj || optionsTj.some((option) => !option)) {
      throw new HttpError(
        400,
        "Таджикский перевод заполнен не полностью: нужен текст вопроса и все варианты. Или оставьте его пустым.",
      );
    }
    if (new Set(optionsTj).size !== optionsTj.length) {
      throw new HttpError(400, "Таджикские варианты ответа не должны повторяться");
    }
  }
  // Пояснение по-таджикски имеет смысл только вместе с переводом вопроса
  if (explanationTj && !anyTj) {
    throw new HttpError(400, "Чтобы добавить пояснение по-таджикски, переведите и сам вопрос");
  }

  return {
    topicId: input.topicId!,
    text,
    options,
    correct,
    explanation,
    textTj: anyTj ? textTj : null,
    optionsTj,
    explanationTj: anyTj ? explanationTj : "",
  };
}

// Для запроса в базу: перевод вариантов храним как jsonb (или NULL)
export const jsonOrNull = (value: unknown[] | null) => (value ? JSON.stringify(value) : null);

// Название темы: без лишних пробелов и не длиннее 120 символов
export const cleanTitle = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 120) : "");

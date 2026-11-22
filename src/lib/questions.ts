import "server-only";

import { HttpError } from "./http";

export type QuestionInput = {
  topicId?: number;
  text?: string;
  options?: string[];
  correct?: number;
  explanation?: string;
};

// Проверка вопроса перед сохранением
export function cleanQuestion(input: QuestionInput) {
  const text = String(input.text ?? "").trim();
  const filled = (Array.isArray(input.options) ? input.options : []).map((option) => String(option ?? "").trim());
  const correctText = Number.isInteger(input.correct) ? filled[input.correct!] : undefined;
  const options = filled.filter(Boolean);
  const explanation = String(input.explanation ?? "").trim();
  if (text.length < 3) throw new HttpError(400, "Напишите текст вопроса");
  if (text.length > 600) throw new HttpError(400, "Вопрос слишком длинный");
  if (options.length < 2) throw new HttpError(400, "Нужно хотя бы 2 варианта ответа");
  if (options.length > 6) throw new HttpError(400, "Максимум 6 вариантов ответа");
  if (options.some((option) => option.length > 300)) throw new HttpError(400, "Вариант ответа слишком длинный (до 300 символов)");
  if (new Set(options).size !== options.length) throw new HttpError(400, "Варианты ответа не должны повторяться");
  if (!correctText) throw new HttpError(400, "Отметьте правильный ответ");
  if (explanation.length > 600) throw new HttpError(400, "Пояснение слишком длинное (до 600 символов)");
  if (!Number.isInteger(input.topicId)) throw new HttpError(400, "Выберите тему");
  return { topicId: input.topicId!, text, options, correct: options.indexOf(correctText), explanation };
}

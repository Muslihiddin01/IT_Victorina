import "server-only";

import { HttpError } from "./http";

export type QuestionInput = { topicId?: number; text?: string; options?: string[]; correct?: number };

// Проверка вопроса перед сохранением
export function cleanQuestion(input: QuestionInput) {
  const text = input.text?.trim() ?? "";
  const filled = (input.options ?? []).map((option) => option?.trim() ?? "");
  const correctText = filled[input.correct ?? -1];
  const options = filled.filter(Boolean);
  if (text.length < 3) throw new HttpError(400, "Напишите текст вопроса");
  if (text.length > 600) throw new HttpError(400, "Вопрос слишком длинный");
  if (options.length < 2) throw new HttpError(400, "Нужно хотя бы 2 варианта ответа");
  if (options.length > 6) throw new HttpError(400, "Максимум 6 вариантов ответа");
  if (new Set(options).size !== options.length) throw new HttpError(400, "Варианты ответа не должны повторяться");
  if (!correctText) throw new HttpError(400, "Отметьте правильный ответ");
  if (!Number.isInteger(input.topicId)) throw new HttpError(400, "Выберите тему");
  return { topicId: input.topicId!, text, options, correct: options.indexOf(correctText) };
}

// Вопросы списком в простом текстовом формате (для вставки сразу многих вопросов).
//
//   # Урок 8. HTML            ← тема (необязательно; если такой нет — создастся)
//   ? Какой тег делает ссылку?  ← вопрос («?» в начале можно не писать)
//   + <a>                      ← правильный ответ
//   - <p>                      ← неправильные ответы
//   - <img>
//   ! Тег a — от слова anchor   ← пояснение (необязательно)
//
// Вопросы отделяются пустой строкой.

export type ParsedQuestion = {
  line: number; // с какой строки начинается — для понятных ошибок
  topic: string | null; // название темы из строки «# …»
  text: string;
  options: string[];
  correct: number;
  explanation: string;
};

export type ParseResult = { questions: ParsedQuestion[]; errors: string[] };

export function parseQuestions(source: string): ParseResult {
  const questions: ParsedQuestion[] = [];
  const errors: string[] = [];
  let topic: string | null = null;

  type Block = { line: number; text: string[]; options: string[]; correct: number[]; explanation: string[] };
  let block: Block | null = null;

  const finish = () => {
    if (!block) return;
    const b = block;
    block = null;
    const text = b.text.join(" ").trim();
    const where = `Строка ${b.line}`;
    if (!text) return errors.push(`${where}: нет текста вопроса`);
    if (b.options.length < 2) return errors.push(`${where} («${short(text)}»): нужно хотя бы 2 варианта`);
    if (b.options.length > 6) return errors.push(`${where} («${short(text)}»): больше 6 вариантов`);
    if (b.correct.length === 0) return errors.push(`${where} («${short(text)}»): отметьте правильный ответ знаком +`);
    if (b.correct.length > 1) return errors.push(`${where} («${short(text)}»): правильный ответ должен быть один`);
    if (new Set(b.options).size !== b.options.length) {
      return errors.push(`${where} («${short(text)}»): варианты повторяются`);
    }
    questions.push({ line: b.line, topic, text, options: b.options, correct: b.correct[0], explanation: b.explanation.join(" ") });
  };

  source.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    const number = index + 1;
    if (!line) return finish();

    if (line.startsWith("#")) {
      finish();
      topic = line.replace(/^#+\s*/, "").trim() || null;
      return;
    }

    block ??= { line: number, text: [], options: [], correct: [], explanation: [] };
    const marker = line[0];
    const rest = line.slice(1).trim();
    if (marker === "+" || marker === "-") {
      if (!rest) return;
      if (marker === "+") block.correct.push(block.options.length);
      block.options.push(rest);
    } else if (marker === "!") {
      if (rest) block.explanation.push(rest);
    } else if (block.options.length > 0) {
      errors.push(`Строка ${number}: непонятная строка после вариантов — начните её с «+», «-» или «!», или отделите пустой строкой`);
    } else {
      block.text.push(marker === "?" ? rest : line);
    }
  });
  finish();

  return { questions, errors };
}

function short(text: string) {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

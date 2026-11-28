// Тест на скорость печати (как на monkeytype): случайные английские слова, таймер 30 или 60 секунд.
// Общий файл для сервера и браузера: сервер по тем же правилам пересчитывает результат ученика.

export const TYPING_SECONDS = [30, 60] as const;
export type TypingSeconds = (typeof TYPING_SECONDS)[number];
export const isTypingSeconds = (value: unknown): value is TypingSeconds => value === 30 || value === 60;

// Сколько слов показываем: больше, чем успеет напечатать даже очень быстрый ученик за минуту
export const WORD_COUNT = 250;

// Частые короткие английские слова
const WORDS = (
  "the be of and a to in he have it that for they with as not on she at by this we you do but from or which one " +
  "would all will there say who make when can more if no man out other so what time up go about than into could " +
  "state only new year some take come these know see use get like then first any work now may such give over think " +
  "most even find day also after way many must look before great back through long where much should well people " +
  "down own just because good each those feel seem how high too place little world very still friend hand old life " +
  "tell write become here show house both between need mean call develop under last right move thing general school " +
  "never same another begin while number part turn real leave might want point form off child few small since " +
  "against ask late home interest large person end open public follow during present without again hold learn " +
  "around possible head consider word program problem however lead system set order eye plan run keep face fact " +
  "group play stand increase early course change help line city put close case force meet once water upon food build " +
  "hear light phone live every country bring center let side try provide continue name certain power pay result " +
  "question study woman member until far night always service away report something company week music toward " +
  "start social room figure nature though young less enough almost read include teacher nothing yet better big " +
  "boy cost business value second why clear expect family complete act sense mind experience art next near direct " +
  "car map sport important girl game several matter usual rather per often kind among white reason action return " +
  "foot care simple within love human along appear garden believe speak active student month drive concern best " +
  "door hope example computer body ever least happy understand reach effect different idea whole control condition " +
  "field pass fall note special talk particular today measure walk teach low hour type carry rate remain full street " +
  "easy although record sit"
).split(" ");

// Число из строки (например, id комнаты) — чтобы у всех учеников комнаты были одни и те же слова
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Простой генератор случайных чисел с «зерном»: одно зерно — одна и та же последовательность
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeWords(seed: string, count = WORD_COUNT): string[] {
  const next = random(hash(seed));
  const words: string[] = [];
  while (words.length < count) {
    const word = WORDS[Math.floor(next() * WORDS.length)];
    if (word !== words.at(-1)) words.push(word); // одно и то же слово два раза подряд — некрасиво
  }
  return words;
}

// Слов в минуту (WPM), как на monkeytype: «слово» — это 5 символов.
// Считаем только правильно напечатанные слова (вместе с пробелом после них)
// и правильное начало слова, которое ученик печатал, когда время вышло.
// typed — законченные слова, current — недопечатанное.
export function countWpm(words: string[], typed: string[], current: string, seconds: number) {
  let chars = 0;
  typed.forEach((word, i) => {
    if (word === words[i]) chars += word.length + 1;
  });
  const next = words[typed.length];
  if (current && next?.startsWith(current)) chars += current.length;
  return seconds > 0 ? Math.round(chars / 5 / (seconds / 60)) : 0;
}

export type TypingResult = { wpm: number; typed: string[]; current: string };

"use client";

// Язык для ученика: русский или таджикский.
// Выбор хранится в браузере (localStorage), поэтому работает и без интернета
// и сохраняется до следующего раза. Админка остаётся на русском.

import { useEffect, useSyncExternalStore } from "react";

import { plural } from "./client";
import type { Translation } from "./types";

export type Lang = "ru" | "tj";

const KEY = "quiz:lang";
const EVENT = "quiz-lang";

function read(): Lang {
  try {
    return localStorage.getItem(KEY) === "tj" ? "tj" : "ru";
  } catch {
    return "ru";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange); // переключили в другой вкладке
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function setLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // приватный режим — язык просто не запомнится
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useLang() {
  const lang = useSyncExternalStore(subscribe, read, () => "ru" as Lang);
  useEffect(() => {
    document.documentElement.lang = lang === "tj" ? "tg" : "ru";
  }, [lang]);
  return { lang, t: TEXT[lang], err: (message: string) => translateError(message, lang) };
}

type Localizable = Translation & { topic: string; text: string; options: string[]; explanation?: string; explanationTj?: string };

// Вопрос на выбранном языке. Если перевода нет — показываем русский.
// Варианты идут парами, поэтому номер выбранного ответа при смене языка не меняется.
export function localize(question: Localizable, lang: Lang) {
  const tj = Boolean(
    lang === "tj" && question.textTj && question.optionsTj?.length === question.options.length,
  );
  return {
    topic: (lang === "tj" && question.topicTj) || question.topic,
    text: tj ? question.textTj! : question.text,
    options: tj ? question.optionsTj! : question.options,
    explanation: (tj && question.explanationTj) || question.explanation || "",
    translated: tj,
    // для атрибута lang: так экранный диктор и переносы слов работают правильно
    htmlLang: tj ? "tg" : "ru",
  };
}

const RU = {
  langLabel: "Язык",
  // вход
  loginLead: "Войди под логином и паролем, которые дал учитель.",
  login: "Логин",
  password: "Пароль",
  signIn: "Войти",
  signInFailed: "Ошибка входа",
  // код комнаты
  logout: "Выйти",
  hello: (name: string) => `Привет, ${name}!`,
  roomCode: "Код комнаты",
  roomCodeHint: "Учитель покажет его на экране: 4 цифры.",
  backToTest: (title: string) => `Вернуться к тесту «${title}»`,
  joinRoom: "Войти в комнату",
  // ожидание
  leaveRoom: "Выйти из комнаты",
  youAreIn: (name: string) => `${name}, ты в комнате`,
  waiting: "Ждём, когда учитель начнёт тест. Не закрывай эту страницу и пока не выключай интернет.",
  questionsWord: (n: number) => plural(n, ["вопрос", "вопроса", "вопросов"]),
  minutesWord: (n: number) => plural(n, ["минута", "минуты", "минут"]),
  studentsHere: (n: number) => `${plural(n, ["ученик", "ученика", "учеников"])} здесь`,
  // тест загружен
  loaded: "Тест загружен",
  loadedText: (n: number) => `${n} ${plural(n, ["вопрос", "вопроса", "вопросов"])} уже на твоём устройстве. Теперь `,
  turnOff: "выключи интернет",
  loadedText2: ": Wi-Fi и мобильные данные. Тест будет работать без него.",
  extended: "Учитель добавил время",
  extendedText: "Твои ответы сохранены, тест можно продолжить. Снова ",
  extendedText2: " и нажми «Продолжить».",
  watched: "Если во время теста интернет включится или ты уйдёшь со страницы, учитель это увидит. Время уже идёт.",
  start: "Начать тест",
  resume: "Продолжить тест",
  startHint: "Кнопка заработает, когда интернет выключится",
  cantTurnOff: "Не получается выключить интернет",
  withInternetText: "Можно начать и с интернетом, но учитель увидит отметку «решал с интернетом».",
  startWithInternet: "Начать с включённым интернетом",
  online: "Интернет включён",
  offline: "Интернет выключен",
  timeLeft: "Осталось",
  // вопросы
  questionOf: (i: number, n: number) => `Вопрос ${i} из ${n}`,
  noTranslation: "Перевода нет — вопрос на русском",
  back: "Назад",
  next: "Далее",
  finish: "Завершить",
  answered: (a: number, n: number) => `Отвечено ${a} из ${n}`,
  allQuestions: "Все вопросы",
  questionAria: (i: number, done: boolean) => `Вопрос ${i}${done ? ", есть ответ" : ""}`,
  finishTest: "Завершить тест",
  confirmPartial: (a: number, n: number) => `Ты ответил на ${a} из ${n}. Точно завершить?`,
  confirmAll: "Все ответы готовы. Завершить тест?",
  noChanges: "После этого ответы изменить нельзя.",
  return: "Вернуться",
  noticeOnline: "Интернет включился — учитель это видит. Выключи его, пока решаешь тест.",
  noticeLeave: "Ты уходил со страницы теста — учитель это увидит.",
  noticeFinished: "Учитель завершил тест.",
  noticeExtended: "Учитель добавил время.",
  // отправка
  finished: "Тест завершён",
  savedHere: (a: number, n: number) => `Ответы сохранены на этом устройстве (${a} из ${n}).`,
  sendingToTeacher: "Отправляем их учителю…",
  turnOn: "Включи интернет",
  turnOnRest: ", чтобы отправить их учителю.",
  sending: "Отправляем…",
  send: "Отправить ответы",
  signInAgain: "Войти заново",
  dontClose: "Не закрывай страницу. Если закроешь — ответы не пропадут, просто открой тест снова.",
  reLogin: "Нужно войти заново. Ответы сохранены на этом устройстве — после входа тест откроется сам.",
  sendFailed: "Не получилось отправить",
  // результат
  yourResult: "Твой результат",
  of: "из",
  verdicts: [
    "Идеально! Все ответы верные.",
    "Отлично! Почти всё верно.",
    "Хорошо! Есть что повторить.",
    "Неплохо, но темы стоит повторить.",
    "Не сдавайся: повтори уроки и попробуй снова.",
  ],
  resultSent: "Результат уже у учителя.",
  review: "Разбор ошибок",
  noAnswer: "Нет ответа",
  yourAnswer: (option: string) => `Твой ответ: ${option}`,
  rightAnswer: (option: string) => `Правильно: ${option}`,
  reviewLater:
    "Разбор появится здесь сам, когда учитель завершит тест для всех: так никто не сможет подсказать ответы остальным.",
  reviewOffline: "Включи интернет, чтобы его увидеть.",
  // тест закрыт
  closed: "Тест уже завершён",
  closedText: "Этот тест закончился раньше, чем ты успел его скачать.",
  otherCode: "Ввести другой код",
  error: "Ошибка",
  // меню и тренировка
  navTest: "Тест по коду",
  navPractice: "Тренировка",
  practiceTitle: "Тренировка",
  practiceLead: "Выбери тему и отвечай на вопросы. Здесь нет времени и оценки: после каждого ответа сразу видно, правильно ли.",
  allTopics: "Все темы вместе",
  allTopicsHint: (n: number) => `${n} случайных ${plural(n, ["вопрос", "вопроса", "вопросов"])} из всех уроков`,
  topicCount: (n: number) => `${n} ${plural(n, ["вопрос", "вопроса", "вопросов"])}`,
  noTopics: "Вопросов для тренировки пока нет.",
  backToTopics: "Все темы",
  right: "Правильно!",
  wrong: "Неправильно.",
  correctIs: (option: string) => `Правильный ответ: ${option}`,
  scoreNow: (score: number, done: number) => `Верно ${score} из ${done}`,
  practiceDone: "Тренировка закончена",
  again: "Ещё раз",
  otherTopic: "Другая тема",
  // печатание
  typingTap: "Нажми сюда и начинай печатать",
  typingTitle: "Печатание на скорость",
  typingCardHint: "Английские слова · 30 или 60 секунд",
  typingLead: "Печатай слова как можно быстрее. Таймер запустится с первой буквы. После слова — пробел.",
  typingRestart: "Ещё раз",
  typingRecord: "Твой рекорд",
  typingNewRecord: "Новый рекорд! Учитель его увидит.",
  typingGoal: (goal: number) => `Норма — ${goal} слов в минуту`,
  typingSeconds: (n: number) => `${n} сек`,
  wpm: "слов в минуту",
  typingHideWpm: "скрыть",
  typingShowWpm: "показать скорость",
  typingRoomLead: (n: number) => `Тест на печатание: ${n} секунд. Таймер запустится с первой буквы.`,
  typingWaiting: "Ждём, когда учитель начнёт. Не закрывай эту страницу.",
  typingSent: "Результат уже у учителя.",
  typingClosed: "Учитель уже завершил этот тест.",
  typingOneTry: "Попытка одна: печатай внимательно.",
  typingGoalPassed: (goal: number) => `Норма ${goal} слов в минуту — пройдена!`,
  typingGoalMissed: (goal: number, left: number) => `Норма — ${goal} слов в минуту. Не хватило ${left}. Тренируйся и попробуй ещё раз.`,
};

// В таджикском после числа слово не меняется: 1 савол, 5 савол.
const TJ: typeof RU = {
  langLabel: "Забон",
  loginLead: "Бо логин ва пароле, ки муаллим додааст, ворид шав.",
  login: "Логин",
  password: "Парол",
  signIn: "Ворид шудан",
  signInFailed: "Хатои воридшавӣ",
  logout: "Баромадан",
  hello: (name) => `Салом, ${name}!`,
  roomCode: "Рамзи ҳуҷра",
  roomCodeHint: "Муаллим онро дар экран нишон медиҳад: 4 рақам.",
  backToTest: (title) => `Ба тести «${title}» баргаштан`,
  joinRoom: "Ба ҳуҷра ворид шудан",
  leaveRoom: "Аз ҳуҷра баромадан",
  youAreIn: (name) => `${name}, ту дар ҳуҷра ҳастӣ`,
  waiting: "Интизор мешавем, ки муаллим тестро оғоз кунад. Ин саҳифаро напӯш ва ҳоло интернетро хомӯш накун.",
  questionsWord: () => "савол",
  minutesWord: () => "дақиқа",
  studentsHere: () => "хонанда дар ин ҷо",
  loaded: "Тест боргирӣ шуд",
  loadedText: (n) => `${n} савол аллакай дар дастгоҳи ту ҳаст. Акнун `,
  turnOff: "интернетро хомӯш кун",
  loadedText2: ": Wi-Fi ва интернети мобилӣ. Тест бе он кор мекунад.",
  extended: "Муаллим вақт илова кард",
  extendedText: "Ҷавобҳои ту нигоҳ дошта шудаанд, тестро идома додан мумкин. Боз ",
  extendedText2: " ва «Идома»-ро пахш кун.",
  watched: "Агар ҳангоми тест интернет фаъол шавад ё ту аз саҳифа равӣ, муаллим инро мебинад. Вақт аллакай мегузарад.",
  start: "Оғози тест",
  resume: "Идомаи тест",
  startHint: "Тугма вақте кор мекунад, ки интернет хомӯш шавад",
  cantTurnOff: "Интернетро хомӯш карда наметавонам",
  withInternetText: "Бо интернет ҳам оғоз кардан мумкин, аммо муаллим қайди «бо интернет ҳал кард»-ро мебинад.",
  startWithInternet: "Бо интернети фаъол оғоз кардан",
  online: "Интернет фаъол аст",
  offline: "Интернет хомӯш аст",
  timeLeft: "Боқӣ монд",
  questionOf: (i, n) => `Саволи ${i} аз ${n}`,
  noTranslation: "Тарҷума нест — савол бо забони русӣ",
  back: "Ба қафо",
  next: "Навбатӣ",
  finish: "Анҷом",
  answered: (a, n) => `Ҷавоб дода шуд: ${a} аз ${n}`,
  allQuestions: "Ҳамаи саволҳо",
  questionAria: (i, done) => `Саволи ${i}${done ? ", ҷавоб дорад" : ""}`,
  finishTest: "Анҷоми тест",
  confirmPartial: (a, n) => `Ту ба ${a} аз ${n} савол ҷавоб додӣ. Тестро анҷом медиҳӣ?`,
  confirmAll: "Ҳамаи ҷавобҳо тайёранд. Тестро анҷом медиҳӣ?",
  noChanges: "Баъд аз ин ҷавобҳоро иваз кардан мумкин нест.",
  return: "Бозгашт",
  noticeOnline: "Интернет фаъол шуд — муаллим инро мебинад. То охири тест онро хомӯш нигоҳ дор.",
  noticeLeave: "Ту аз саҳифаи тест баромадӣ — муаллим инро мебинад.",
  noticeFinished: "Муаллим тестро анҷом дод.",
  noticeExtended: "Муаллим вақт илова кард.",
  finished: "Тест анҷом ёфт",
  savedHere: (a, n) => `Ҷавобҳо дар ҳамин дастгоҳ нигоҳ дошта шуданд (${a} аз ${n}).`,
  sendingToTeacher: "Онҳоро ба муаллим мефиристем…",
  turnOn: "Интернетро фаъол кун",
  turnOnRest: ", то ҷавобҳо ба муаллим фиристода шаванд.",
  sending: "Мефиристем…",
  send: "Фиристодани ҷавобҳо",
  signInAgain: "Аз нав ворид шудан",
  dontClose: "Саҳифаро напӯш. Агар пӯшӣ ҳам, ҷавобҳо гум намешаванд — танҳо тестро аз нав кушо.",
  reLogin: "Бояд аз нав ворид шавӣ. Ҷавобҳо дар ҳамин дастгоҳ нигоҳ дошта шудаанд — баъди воридшавӣ тест худаш кушода мешавад.",
  sendFailed: "Фиристодан нашуд",
  yourResult: "Натиҷаи ту",
  of: "аз",
  verdicts: [
    "Аъло! Ҳамаи ҷавобҳо дурустанд.",
    "Хеле хуб! Қариб ҳамааш дуруст аст.",
    "Хуб! Баъзе мавзӯъҳоро такрор кардан лозим.",
    "Бад нест, аммо мавзӯъҳоро такрор кардан даркор.",
    "Рӯҳафтода нашав: дарсҳоро такрор кун ва боз кӯшиш намо.",
  ],
  resultSent: "Натиҷа аллакай назди муаллим аст.",
  review: "Таҳлили хатоҳо",
  noAnswer: "Ҷавоб нест",
  yourAnswer: (option) => `Ҷавоби ту: ${option}`,
  rightAnswer: (option) => `Ҷавоби дуруст: ${option}`,
  reviewLater:
    "Таҳлил худаш дар ин ҷо пайдо мешавад, вақте ки муаллим тестро барои ҳама анҷом диҳад: ҳамин тавр касе ба дигарон ҷавоб гуфта наметавонад.",
  reviewOffline: "Барои дидани он интернетро фаъол кун.",
  closed: "Тест аллакай анҷом ёфтааст",
  closedText: "Ин тест пеш аз он ки ту онро боргирӣ кунӣ, анҷом ёфт.",
  otherCode: "Рамзи дигар ворид кардан",
  error: "Хато",
  navTest: "Тест бо рамз",
  navPractice: "Машқ",
  practiceTitle: "Машқ",
  practiceLead: "Мавзӯъро интихоб кун ва ба саволҳо ҷавоб деҳ. Дар ин ҷо вақт ва баҳо нест: баъди ҳар ҷавоб фавран маълум мешавад, ки дуруст аст ё не.",
  allTopics: "Ҳамаи мавзӯъҳо якҷоя",
  allTopicsHint: (n) => `${n} саволи тасодуфӣ аз ҳамаи дарсҳо`,
  topicCount: (n) => `${n} савол`,
  noTopics: "Ҳоло барои машқ савол нест.",
  backToTopics: "Ҳамаи мавзӯъҳо",
  right: "Дуруст!",
  wrong: "Нодуруст.",
  correctIs: (option) => `Ҷавоби дуруст: ${option}`,
  scoreNow: (score, done) => `Дуруст ${score} аз ${done}`,
  practiceDone: "Машқ тамом шуд",
  again: "Боз як бор",
  otherTopic: "Мавзӯи дигар",
  // печатание
  typingTap: "Ин ҷо пахш кун ва чопро оғоз кун",
  typingTitle: "Тез чоп кардан",
  typingCardHint: "Калимаҳои англисӣ · 30 ё 60 сония",
  typingLead: "Калимаҳоро ҳарчи тезтар чоп кун. Вақтсанҷ аз ҳарфи аввал оғоз мешавад. Баъди калима — фосила.",
  typingRestart: "Боз як бор",
  typingRecord: "Рекорди ту",
  typingNewRecord: "Рекорди нав! Муаллим онро мебинад.",
  typingGoal: (goal: number) => `Меъёр — ${goal} калима дар як дақиқа`,
  typingSeconds: (n: number) => `${n} сон.`,
  wpm: "калима дар як дақиқа",
  typingHideWpm: "пинҳон",
  typingShowWpm: "суръатро нишон деҳ",
  typingRoomLead: (n: number) => `Санҷиши чоп: ${n} сония. Вақтсанҷ аз ҳарфи аввал оғоз мешавад.`,
  typingWaiting: "Интизорем, ки муаллим оғоз кунад. Ин саҳифаро напӯш.",
  typingSent: "Натиҷа аллакай дар назди муаллим аст.",
  typingClosed: "Муаллим ин санҷишро аллакай анҷом дод.",
  typingOneTry: "Танҳо як кӯшиш: бодиққат чоп кун.",
  typingGoalPassed: (goal: number) => `Меъёри ${goal} калима дар як дақиқа — гузашт!`,
  typingGoalMissed: (goal: number, left: number) => `Меъёр — ${goal} калима дар як дақиқа. ${left} калима нарасид. Машқ кун ва боз кӯшиш кун.`,
};

const TEXT = { ru: RU, tj: TJ };

// Русские тексты — для ошибок, которые сохраняются по-русски и переводятся при показе
export const RU_TEXT = RU;

// Сервер присылает ошибки по-русски — переводим те, что может увидеть ученик
const ERRORS_TJ: Record<string, string> = {
  "Нет связи с сервером. Проверьте интернет.": "Бо сервер алоқа нест. Интернетро санҷед.",
  "Что-то пошло не так": "Чизе нодуруст шуд",
  "Слишком часто. Попробуй ещё раз": "Хеле зуд-зуд. Боз кӯшиш кун",
  "Введите логин и пароль": "Логин ва паролро ворид кунед",
  "Неверный логин или пароль": "Логин ё парол нодуруст аст",
  "Код комнаты — 4 цифры": "Рамзи ҳуҷра — 4 рақам",
  "Комнаты с таким кодом нет или тест уже завершён": "Ҳуҷра бо чунин рамз нест ё тест аллакай анҷом ёфтааст",
  "Комната не найдена": "Ҳуҷра ёфт нашуд",
  "Нет доступа": "Дастрасӣ нест",
  "Нужно войти в систему": "Бояд ба система ворид шавед",
  "Сначала войдите в комнату по коду": "Аввал бо рамз ба ҳуҷра ворид шавед",
  "Тест ещё не начался": "Тест ҳанӯз оғоз нашудааст",
  "Тест уже завершён": "Тест аллакай анҷом ёфтааст",
  "Время теста уже вышло": "Вақти тест аллакай тамом шуд",
  "Время этого теста уже вышло": "Вақти ин тест аллакай тамом шуд",
  "Ты уже отправил ответы": "Ту ҷавобҳоро аллакай фиристодӣ",
  "Неверный формат запроса": "Дархост нодуруст аст",
  "Тема не найдена": "Мавзӯъ ёфт нашуд",
  [RU.signInFailed]: TJ.signInFailed,
  [RU.sendFailed]: TJ.sendFailed,
  [RU.reLogin]: TJ.reLogin,
  [RU.error]: TJ.error,
};

function translateError(message: string, lang: Lang) {
  if (lang === "ru" || !message) return message;
  return ERRORS_TJ[message] ?? message;
}

// Переключатель «Рус | Тоҷ»
export function LangSwitch({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { lang, t } = useLang();
  const options: [Lang, string, string][] = [
    ["ru", "Рус", "Русский"],
    ["tj", "Тоҷ", "Тоҷикӣ"],
  ];
  return (
    <div
      role="group"
      aria-label={t.langLabel}
      className={`inline-flex flex-none rounded-full p-1 ${tone === "dark" ? "bg-white/15" : "bg-line/70"}`}
    >
      {options.map(([value, short, full]) => {
        const active = lang === value;
        return (
          <button
            key={value}
            type="button"
            lang={value === "tj" ? "tg" : "ru"}
            title={full}
            aria-pressed={active}
            onClick={() => setLang(value)}
            className={`rounded-full px-3 py-1 text-sm font-bold transition ${
              active
                ? tone === "dark"
                  ? "bg-white text-cobalt"
                  : "bg-white text-ink shadow-[0_2px_0_var(--color-line)]"
                : tone === "dark"
                  ? "text-white/80 hover:text-white"
                  : "text-muted hover:text-ink"
            }`}
          >
            {short}
          </button>
        );
      })}
    </div>
  );
}

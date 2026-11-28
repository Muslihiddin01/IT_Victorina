"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { useLang } from "@/lib/i18n";
import { countWpm, type TypingResult } from "@/lib/typing";

type Latest = { typed: string[]; current: string; onFinish: (result: TypingResult) => void };
type Caret = "hidden" | "idle" | "typing";

// Скорость во время печатания — как на monkeytype: спокойная, а не на каждую букву.
const WPM_DELAY = 3; // в первые секунды скорость скачет сильнее всего — не показываем
const SMOOTH = 0.35; // раз в секунду цифра сдвигается на треть к настоящей скорости: ошибка не роняет её резко
const LIVE_KEY = "quiz:typing-live"; // ученик может скрыть скорость, чтобы не отвлекала

// Печатание на скорость. Таймер запускается с первой буквы, пробел — следующее слово.
// Backspace в начале слова возвращает к предыдущему, если в нём ошибка (как на monkeytype).
// Поле ввода спрятано, но настоящее: так работает и клавиатура телефона.
export function TypingTest({
  words,
  seconds,
  onFinish,
  disabled = false,
}: {
  words: string[];
  seconds: number;
  onFinish: (result: TypingResult) => void;
  disabled?: boolean;
}) {
  const { t } = useLang();
  const [typed, setTyped] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false); // печатает прямо сейчас — курсор не мигает
  const input = useRef<HTMLInputElement>(null);
  const pause = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Последние значения — для таймеров, которые не должны перезапускаться на каждую букву
  const latest = useRef<Latest>({ typed, current, onFinish });
  useEffect(() => {
    latest.current = { typed, current, onFinish };
  });

  useEffect(() => {
    if (!disabled) input.current?.focus();
  }, [disabled]);
  useEffect(() => () => clearTimeout(pause.current), []);

  // Конец времени. Здесь нет setState на каждый тик, поэтому слова не перерисовываются зря
  useEffect(() => {
    if (startedAt === null || done) return;
    const tick = setInterval(() => {
      if (Date.now() - startedAt < seconds * 1000) return;
      clearInterval(tick);
      setDone(true);
      input.current?.blur();
      const { typed: list, current: rest, onFinish: finish } = latest.current;
      finish({ wpm: countWpm(words, list, rest, seconds), typed: list, current: rest });
    }, 50);
    return () => clearInterval(tick);
  }, [startedAt, done, seconds, words]);

  function handleInput(value: string) {
    if (done || disabled) return;
    // Любой пробел (и неразрывный с телефона) — конец слова; остальное, кроме букв, не печатается
    const clean = value
      .toLowerCase()
      .replace(/\s/g, " ")
      .replace(/[^a-z' ]/g, "");
    if (startedAt === null && clean.trim()) setStartedAt(Date.now());
    // В поле могло попасть сразу несколько слов (быстрый набор, подсказка клавиатуры телефона):
    // все законченные слова засчитываем по очереди, последнее остаётся недопечатанным.
    // Пробел в начале слова ничего не делает — пустые куски пропускаем.
    const parts = clean.split(" ");
    const last = parts.pop() ?? "";
    const finished = parts.filter(Boolean).map((word) => word.slice(0, 30));
    if (finished.length) setTyped([...typed, ...finished].slice(0, words.length));
    setCurrent(last.slice(0, 30));
    // Пока печатает — курсор горит ровно, замер на полсекунды — снова мигает
    setBusy(true);
    clearTimeout(pause.current);
    pause.current = setTimeout(() => setBusy(false), 500);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Вернуться к предыдущему слову можно, только если в нём ошибка
    if (event.key === "Backspace" && current === "" && typed.length > 0) {
      const last = typed.length - 1;
      if (typed[last] !== words[last]) {
        event.preventDefault();
        setCurrent(typed[last]);
        setTyped(typed.slice(0, last));
      }
    }
  }

  const caret: Caret = !focused || done ? "hidden" : busy ? "typing" : "idle";

  return (
    <div>
      <Stats startedAt={startedAt} seconds={seconds} done={done} words={words} latest={latest} input={input} />

      <div
        className={`typing-box relative mt-4 cursor-text overflow-hidden rounded-2xl border-[1.5px] bg-white px-4 py-3 transition ${
          focused ? "border-cobalt" : "border-line"
        }`}
        onClick={() => input.current?.focus()}
      >
        <Words words={words} typed={typed} current={current} caret={caret} />
        {!focused && !done && !disabled && (
          <div className="absolute inset-0 grid place-items-center bg-white/75 text-lg font-semibold text-cobalt backdrop-blur-[2px]">
            {t.typingTap}
          </div>
        )}
        <input
          ref={input}
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
          style={{ fontSize: 16 }} // меньше 16px — iPhone приближает страницу
          value={current}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={(e) => e.preventDefault()}
          disabled={disabled || done}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label="Поле для печатания"
        />
      </div>
    </div>
  );
}

function readLive() {
  try {
    return localStorage.getItem(LIVE_KEY) !== "off";
  } catch {
    return true;
  }
}

// Таймер и скорость. Живут отдельно от слов: их тиканье не перерисовывает текст.
function Stats({
  startedAt,
  seconds,
  done,
  words,
  latest,
  input,
}: {
  startedAt: number | null;
  seconds: number;
  done: boolean;
  words: string[];
  latest: RefObject<Latest>;
  input: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useLang();
  const [left, setLeft] = useState(seconds);
  const [wpm, setWpm] = useState<number | null>(null);
  const [live, setLive] = useState(readLive);

  useEffect(() => {
    if (startedAt === null || done) return;
    let second = 0;
    const tick = setInterval(() => {
      const elapsed = Math.min(seconds, (Date.now() - startedAt) / 1000);
      setLeft(Math.max(0, Math.ceil(seconds - elapsed))); // то же число — React ничего не перерисует
      // Скорость — раз в секунду, по целым секундам
      const whole = Math.floor(elapsed);
      if (whole === second) return;
      second = whole;
      if (whole < WPM_DELAY) return;
      const { typed, current } = latest.current;
      const now = countWpm(words, typed, current, whole);
      setWpm((shown) => (shown === null ? now : shown + SMOOTH * (now - shown)));
    }, 100);
    return () => clearInterval(tick);
  }, [startedAt, done, seconds, words, latest]);

  function toggle(next: boolean) {
    setLive(next);
    try {
      localStorage.setItem(LIVE_KEY, next ? "on" : "off");
    } catch {}
    input.current?.focus();
  }

  return (
    <div className="flex items-end justify-between gap-3">
      <p
        className="font-display text-[40px] font-bold leading-none tabular-nums text-cobalt"
        aria-label="Осталось секунд"
      >
        {done ? 0 : left}
      </p>
      {/* onMouseDown: кнопка не забирает фокус у поля — печатание не прерывается */}
      <p className="text-right text-muted">
        {live ? (
          <>
            <b className="font-display text-xl tabular-nums">{wpm === null ? "—" : Math.round(wpm)}</b> {t.wpm}
            <button
              type="button"
              className="ml-2 text-sm font-semibold text-cobalt"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggle(false)}
            >
              {t.typingHideWpm}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="text-sm font-semibold text-cobalt"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggle(true)}
          >
            {t.typingShowWpm}
          </button>
        )}
      </p>
    </div>
  );
}

// Слова и курсор. Перерисовываются только от нажатий, а не от таймера.
const Words = memo(function Words({
  words,
  typed,
  current,
  caret,
}: {
  words: string[];
  typed: string[];
  current: string;
  caret: Caret;
}) {
  const caretWord = useRef<HTMLSpanElement>(null);
  const caretLine = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  const index = typed.length;
  // Показываем слова чуть дальше текущего — остальные всё равно не видны
  const visible = words.slice(0, Math.min(words.length, index + 60));

  // Курсор один на весь текст и переезжает плавно (transform + transition), как на monkeytype
  useLayoutEffect(() => {
    const word = caretWord.current;
    const line = caretLine.current;
    if (!word || !line) return;
    const letters = word.children;
    const n = Math.min(current.length, letters.length);
    let x = word.offsetLeft;
    if (n < letters.length) x += (letters[n] as HTMLElement).offsetLeft;
    else if (n > 0) x += (letters[n - 1] as HTMLElement).offsetLeft + (letters[n - 1] as HTMLElement).offsetWidth;
    line.style.transform = `translate3d(${x - 1}px, ${word.offsetTop}px, 0)`;
  }, [typed, current]);

  // Видно три строки: когда текущее слово уходит на третью, текст сдвигается вверх
  useLayoutEffect(() => {
    const word = caretWord.current;
    if (!word) return;
    setShift(Math.max(0, word.offsetTop - word.offsetHeight));
  }, [typed.length]);

  return (
    <div className="typing-words" style={{ transform: `translateY(-${shift}px)` }}>
      {visible.map((word, i) => {
        const isCurrent = i === index;
        const attempt = i < index ? typed[i] : isCurrent ? current : "";
        const wrongWord = i < index && attempt !== word;
        const extra = attempt.length > word.length ? attempt.slice(word.length) : "";
        return (
          <span
            key={i}
            ref={isCurrent ? caretWord : undefined}
            className={`typing-word ${wrongWord ? "typing-word-wrong" : ""}`}
          >
            {word.split("").map((letter, k) => {
              const state = k < attempt.length ? (attempt[k] === letter ? "ok" : "bad") : i < index ? "missed" : "";
              return (
                <span key={k} className={`typing-letter ${state ? `typing-${state}` : ""}`}>
                  {letter}
                </span>
              );
            })}
            {extra.split("").map((letter, k) => (
              <span key={`x${k}`} className="typing-letter typing-extra">
                {letter}
              </span>
            ))}
          </span>
        );
      })}
      <span
        ref={caretLine}
        className={`typing-caret ${caret === "idle" ? "typing-caret-idle" : ""}`}
        style={{ visibility: caret === "hidden" ? "hidden" : "visible" }}
        aria-hidden
      />
    </div>
  );
});

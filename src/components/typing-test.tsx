"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useLang } from "@/lib/i18n";
import { countWpm, type TypingResult } from "@/lib/typing";

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
  const [now, setNow] = useState(0);
  const [focused, setFocused] = useState(false);
  const [done, setDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const caretWord = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  // Последние значения — для таймера, который не должен перезапускаться на каждую букву
  const latest = useRef({ typed, current, onFinish });
  useEffect(() => {
    latest.current = { typed, current, onFinish };
  });

  useEffect(() => {
    if (!disabled) input.current?.focus();
  }, [disabled]);

  // Таймер
  useEffect(() => {
    if (startedAt === null || done) return;
    const tick = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time - startedAt >= seconds * 1000) {
        clearInterval(tick);
        setDone(true);
        input.current?.blur();
        const { typed: words_, current: rest, onFinish: finish } = latest.current;
        finish({
          wpm: countWpm(words, words_, rest, seconds),
          typed: words_,
          current: rest,
        });
      }
    }, 100);
    return () => clearInterval(tick);
  }, [startedAt, done, seconds, words]);

  // Видно три строки: когда текущее слово уходит на третью, текст сдвигается вверх
  useLayoutEffect(() => {
    const word = caretWord.current;
    if (!word) return;
    const line = word.offsetHeight;
    setShift(Math.max(0, word.offsetTop - line));
  }, [typed.length]);

  function handleInput(value: string) {
    if (done || disabled) return;
    // Любой пробел (и неразрывный с телефона) — конец слова; остальное, кроме букв, не печатается
    const clean = value.toLowerCase().replace(/\s/g, " ").replace(/[^a-z' ]/g, "");
    if (startedAt === null && clean.trim()) {
      const time = Date.now();
      setStartedAt(time);
      setNow(time);
    }
    // В поле могло попасть сразу несколько слов (быстрый набор, подсказка клавиатуры телефона):
    // все законченные слова засчитываем по очереди, последнее остаётся недопечатанным.
    // Пробел в начале слова ничего не делает — пустые куски пропускаем.
    const parts = clean.split(" ");
    const last = parts.pop() ?? "";
    const finished = parts.filter(Boolean).map((word) => word.slice(0, 30));
    if (finished.length) setTyped([...typed, ...finished].slice(0, words.length));
    setCurrent(last.slice(0, 30));
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

  const elapsed = startedAt === null ? 0 : Math.min(seconds, (now - startedAt) / 1000);
  const left = Math.max(0, Math.ceil(seconds - elapsed));
  const liveWpm = elapsed >= 1 ? countWpm(words, typed, current, elapsed) : 0;
  const index = typed.length;
  // Показываем слова чуть дальше текущего — остальные всё равно не видны
  const visible = words.slice(0, Math.min(words.length, index + 60));

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <p
          className="font-display text-[40px] font-bold leading-none tabular-nums text-cobalt"
          aria-label="Осталось секунд"
        >
          {left}
        </p>
        <p className="text-right text-muted">
          <b className="font-display text-2xl tabular-nums text-ink">{liveWpm}</b> {t.wpm}
        </p>
      </div>

      <div
        ref={box}
        className={`typing-box relative mt-4 cursor-text overflow-hidden rounded-2xl border-[1.5px] bg-white px-4 py-3 transition ${
          focused ? "border-cobalt" : "border-line"
        }`}
        onClick={() => input.current?.focus()}
      >
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
                      {isCurrent && k === current.length && focused && !done && <span className="typing-caret" />}
                      {letter}
                    </span>
                  );
                })}
                {extra.split("").map((letter, k) => (
                  <span key={`x${k}`} className="typing-letter typing-extra">
                    {letter}
                  </span>
                ))}
                {isCurrent && current.length >= word.length && focused && !done && (
                  <span className="typing-caret typing-caret-end" />
                )}
              </span>
            );
          })}
        </div>
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

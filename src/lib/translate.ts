import "server-only";

import { HttpError } from "./http";

// Автоматический перевод с русского на таджикский через бесплатный сервис MyMemory
// (https://mymemory.translated.net). Ключ не нужен, но есть дневной лимит: около 5000 символов.
// Если задать MYMEMORY_EMAIL в настройках Vercel, лимит вырастет до 50 000 символов в день.

const API = "https://api.mymemory.translated.net/get";
// Сервис принимает до 500 байт за раз; русская буква — 2 байта, поэтому длинный текст режем на куски
const MAX_BYTES = 450;

const bytes = (text: string) => new TextEncoder().encode(text).length;

// Режем по предложениям, а слишком длинное предложение — по словам
function chunks(text: string): string[] {
  if (bytes(text) <= MAX_BYTES) return [text];
  const parts: string[] = [];
  let current = "";
  const push = (piece: string) => {
    const next = current ? `${current} ${piece}` : piece;
    if (bytes(next) <= MAX_BYTES) current = next;
    else {
      if (current) parts.push(current);
      current = piece;
    }
  };
  for (const sentence of text.split(/(?<=[.!?…])\s+/)) {
    if (bytes(sentence) <= MAX_BYTES) push(sentence);
    else for (const word of sentence.split(/\s+/)) push(word);
  }
  if (current) parts.push(current);
  return parts;
}

// Сервис иногда возвращает текст с HTML-сущностями (&quot; и т. п.)
function decode(text: string) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

type Reply = { responseStatus?: number | string; responseData?: { translatedText?: string }; quotaFinished?: boolean };

async function translateChunk(text: string): Promise<string> {
  const params = new URLSearchParams({ q: text, langpair: "ru|tg" });
  const email = process.env.MYMEMORY_EMAIL?.trim();
  if (email) params.set("de", email);

  let reply: Reply;
  try {
    const response = await fetch(`${API}?${params}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    reply = (await response.json()) as Reply;
  } catch {
    throw new HttpError(502, "Сервис перевода не отвечает. Попробуйте чуть позже.");
  }
  const status = Number(reply.responseStatus);
  if (reply.quotaFinished || status === 429) {
    throw new HttpError(429, "Бесплатный лимит перевода на сегодня закончился. Завтра он обновится — или переведите вручную.");
  }
  const translated = reply.responseData?.translatedText?.trim();
  if (status !== 200 || !translated) throw new HttpError(502, "Не удалось перевести. Попробуйте ещё раз.");
  return decode(translated);
}

// Переводим один текст. Без русских букв (код, «Ctrl + C», «mkdir») — оставляем как есть.
async function translateOne(text: string): Promise<string> {
  const clean = text.trim();
  if (!/[а-яё]/i.test(clean)) return clean;
  const parts = await Promise.all(chunks(clean).map(translateChunk));
  return parts.join(" ");
}

export async function translateToTajik(texts: string[]): Promise<string[]> {
  return Promise.all(texts.map((text) => (text.trim() ? translateOne(text) : Promise.resolve(""))));
}

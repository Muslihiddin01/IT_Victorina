"use client";

import { useEffect, useRef, useState } from "react";

import { TrashIcon } from "@/components/icons";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import { imageUrl } from "@/lib/types";

// Картинка к вопросу (в тесте, тренировке, разборе и у учителя)
export function QuestionImage({ id, className = "" }: { id: string | null | undefined; className?: string }) {
  if (!id) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- картинка из нашей базы, оптимизатор Next.js не нужен
    <img
      src={imageUrl(id)}
      alt=""
      className={`max-h-[45vh] w-auto max-w-full rounded-2xl border-[1.5px] border-line bg-white object-contain ${className}`}
    />
  );
}

// Скачиваем картинки теста заранее: после этого ученик выключает интернет, а картинки уже в браузере
export function preloadImages(ids: (string | null | undefined)[]) {
  for (const id of new Set(ids)) {
    if (id) fetch(imageUrl(id)).catch(() => {});
  }
}

const MAX_SIDE = 1200; // больше на экране телефона и проектора всё равно не видно
const MAX_UPLOAD = 1_400_000; // сервер принимает до 1,5 МБ

// Уменьшаем фото с телефона (часто 4000 px и 5 МБ) до 1200 px и сжимаем в JPEG.
// PNG без фото (схемы, скриншоты) оставляем PNG, если он и так небольшой: так он чётче.
async function shrink(file: File): Promise<string> {
  const readAsDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
      reader.readAsDataURL(blob);
    });

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Не удалось открыть картинку. Подойдут JPG, PNG, WebP или GIF.");
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 400_000 && /^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    bitmap.close();
    return readAsDataUrl(file);
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // прозрачный фон PNG в JPEG стал бы чёрным
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.85, 0.7, 0.55]) {
    const data = canvas.toDataURL("image/jpeg", quality);
    if (data.length * 0.75 <= MAX_UPLOAD) return data;
  }
  throw new Error("Картинка слишком большая даже после сжатия");
}

// Поле «Картинка» в редакторе вопроса: выбрать файл или вставить скриншот (Ctrl+V)
export function ImagePicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const data = await shrink(file);
      const { id } = await api<{ id: string }>("/api/admin/images", { method: "POST", body: { data } });
      onChange(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить картинку");
    } finally {
      setBusy(false);
    }
  }

  // Скриншот из буфера обмена (Win + Shift + S, потом Ctrl+V) — пока открыт редактор
  const uploadRef = useRef(upload);
  useEffect(() => {
    uploadRef.current = upload;
  });
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      uploadRef.current(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div>
      <p className="label">
        Картинка <span className="font-normal text-muted">(необязательно; можно вставить скриншот через Ctrl+V)</span>
      </p>
      {value ? (
        <div className="flex flex-wrap items-end gap-3">
          <QuestionImage id={value} className="!max-h-48" />
          <div className="flex gap-2">
            <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? <Spinner className="size-4" /> : null} Заменить
            </button>
            <button type="button" className="btn btn-danger btn-sm !px-2.5" aria-label="Убрать картинку" onClick={() => onChange(null)}>
              <TrashIcon className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-paper/60 px-4 py-5 text-[15px] font-semibold text-muted transition hover:border-key-edge hover:text-cobalt"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? <Spinner className="size-4" /> : "+"} {busy ? "Загружаем…" : "Добавить картинку"}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
      {error && <p className="mt-2 text-sm font-medium text-red-edge">{error}</p>}
    </div>
  );
}

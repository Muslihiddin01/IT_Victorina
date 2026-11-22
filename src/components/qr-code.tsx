"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

// QR-код из ссылки. Рисуется прямо в браузере, без внешних сервисов.
export function QrCode({ text, label, className = "" }: { text: string; label: string; className?: string }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let stopped = false;
    QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#14213d", light: "#ffffff" } })
      .then((result) => {
        if (!stopped) setSvg(result);
      })
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [text]);

  return (
    <div
      role="img"
      aria-label={label}
      className={`overflow-hidden rounded-2xl bg-white p-2 [&>svg]:block [&>svg]:size-full ${className}`}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

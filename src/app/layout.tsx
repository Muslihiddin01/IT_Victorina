import type { Metadata, Viewport } from "next";

import "@fontsource-variable/unbounded";
import "@fontsource-variable/golos-text";
import "./globals.css";

import { ServiceWorker } from "@/components/service-worker";

export const metadata: Metadata = {
  title: "IT Викторина",
  description: "Тесты для учеников: комнаты, таймер и результаты для учителя",
};

export const viewport: Viewport = {
  themeColor: "#2f54eb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}

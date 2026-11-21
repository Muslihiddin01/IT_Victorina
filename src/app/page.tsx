"use client";

import { useEffect } from "react";

import { FullScreenLoader } from "@/components/ui";
import { api } from "@/lib/client";
import { unfinishedTest } from "@/lib/test-storage";
import type { Me } from "@/lib/types";

// Главная: отправляем каждого туда, где ему место
export default function Home() {
  useEffect(() => {
    api<{ user: Me | null }>("/api/me")
      .then(({ user }) => {
        if (!user) window.location.replace("/login");
        else if (user.role === "admin") window.location.replace("/admin");
        else window.location.replace(unfinishedTest(user.id) ? "/test" : "/join");
      })
      .catch(() => window.location.replace("/test"));
  }, []);
  return <FullScreenLoader />;
}

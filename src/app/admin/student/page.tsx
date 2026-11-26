import { Suspense } from "react";

import { Spinner } from "@/components/ui";

import { Journal } from "./journal";

// Журнал успеваемости ученика: /admin/student?id=…
export default function StudentPage() {
  return (
    <Suspense fallback={<Spinner className="size-6 text-cobalt" />}>
      <Journal />
    </Suspense>
  );
}

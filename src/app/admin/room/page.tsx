import { Suspense } from "react";

import { Spinner } from "@/components/ui";

import { RoomView } from "./room-view";

export default function RoomPage() {
  return (
    <Suspense fallback={<Spinner className="size-6 text-cobalt" />}>
      <RoomView />
    </Suspense>
  );
}

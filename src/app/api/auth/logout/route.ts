import { endSession } from "@/lib/auth";
import { json, route } from "@/lib/http";

// POST /api/auth/logout — выход
export const POST = route(async (req) => {
  const res = json({ ok: true });
  await endSession(req, res);
  return res;
});

import { getUser } from "@/lib/auth";
import { json, route } from "@/lib/http";

// GET /api/me — кто сейчас вошёл
export const GET = route(async (req) => {
  const user = await getUser(req);
  const adminReady = Boolean(process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD);
  return json({ user, adminReady });
});

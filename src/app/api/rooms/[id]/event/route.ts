import { json, readJson, route } from "@/lib/http";
import { loadParticipant } from "@/lib/participant";
import { cleanBehaviour } from "@/lib/rooms";
import type { Behaviour } from "@/lib/types";

// POST /api/rooms/:id/event — «живое» нарушение во время теста.
// Браузер присылает его, когда ученик включил интернет или вернулся на страницу
// (а значит, интернет у него есть) — учитель сразу видит это у себя.
export const POST = route(async (req, { id }) => {
  const { db, participant } = await loadParticipant(req, id);
  if (participant.submitted_at) return json({ ok: true });
  const body = await readJson<{ behaviour?: Partial<Behaviour> }>(req);
  const b = cleanBehaviour(body.behaviour);

  await db.query(
    `UPDATE participants SET
        leaves = GREATEST(leaves, $2::int),
        away_ms = GREATEST(away_ms, $3::int),
        online_count = GREATEST(online_count, $4::int),
        online_mode = online_mode OR $5::boolean,
        last_event_at = now(),
        last_seen_at = now()
      WHERE id = $1::uuid`,
    [participant.id, b.leaves, b.awayMs, b.onlineCount, b.onlineMode],
  );
  return json({ ok: true });
});

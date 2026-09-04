import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

/**
 * Forward Forge events to Nudge for verified habit auto-complete.
 * Requires NUDGE_WEBHOOK_URL + NUDGE_WEBHOOK_TOKEN (or INTEGRATION_TOKEN).
 */
export async function notifyNudge(input: {
  userId: string;
  type: "workout_completed" | "nutrition" | "weight";
  payload: Record<string, unknown>;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const url = process.env.NUDGE_WEBHOOK_URL?.trim();
  if (!url) return { ok: true, skipped: true };

  const token =
    process.env.NUDGE_WEBHOOK_TOKEN?.trim() || process.env.INTEGRATION_TOKEN?.trim() || "";
  if (!token) {
    return { ok: false, error: "NUDGE_WEBHOOK_TOKEN not configured" };
  }

  let username: string | undefined;
  try {
    const [user] = await db.select().from(users).where(eq(users.id, input.userId));
    username = user?.username ?? undefined;
  } catch {
    /* ignore */
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Nudge-Token": token,
      },
      body: JSON.stringify({
        // Prefer explicit user id; username is the fallback on Nudge.
        userId: input.userId,
        username,
        type: input.type,
        payload: {
          ...input.payload,
          completedAt:
            typeof input.payload.completedAt === "string"
              ? input.payload.completedAt
              : new Date().toISOString(),
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: body || res.statusText };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Nudge webhook failed" };
  }
}

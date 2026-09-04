import { Platform } from "react-native";
import { apiFetch } from "./api";
import { listLocalEntities } from "../db/local";
import { getActiveSession } from "./workout";
import { NOTIF_IDS, startStickyNotification } from "./notifications";
import { formatFastWhen } from "./dates";

type FastSession = {
  id: string;
  startedAt: string;
  targetHours?: number;
  status: "active" | "completed" | "cancelled";
};

const FAST_STICKY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Re-attach workout / fasting stickies after app restart so they survive updates
 * and cold starts while still active.
 */
export async function restorePersistentStickies() {
  if (Platform.OS === "web") return;

  try {
    const workout = await getActiveSession();
    if (workout?.status === "active") {
      await startStickyNotification({
        id: NOTIF_IDS.workout,
        title: "Workout in progress",
        body: `${workout.focus} · ${workout.kind}${workout.circuitMode ? " circuit" : ""} — swipe won’t clear for 24h`,
        data: { kind: "workout", sessionId: workout.sessionId },
      });
    }
  } catch {
    /* ignore */
  }

  try {
    let active: FastSession | null = null;
    try {
      const res = await apiFetch<{ active: FastSession | null }>("/fasting/active");
      active = res.active;
    } catch {
      const rows = await listLocalEntities("fasting_session");
      active =
        rows.map((r) => r.payload as FastSession).find((s) => s.status === "active") ?? null;
    }
    if (active?.status === "active") {
      const now = Date.now();
      const elapsedH = ((now - new Date(active.startedAt).getTime()) / 3600000).toFixed(1);
      const target = active.targetHours ?? 16;
      const endAt = new Date(new Date(active.startedAt).getTime() + target * 3600000).toISOString();
      await startStickyNotification({
        id: NOTIF_IDS.fasting,
        title: "Fasting in progress",
        body: `${elapsedH}h in · target ${target}h · ends ${formatFastWhen(endAt, now)}`,
        data: { kind: "fasting", sessionId: active.id },
        stickyMs: FAST_STICKY_MS,
      });
    }
  } catch {
    /* ignore */
  }
}

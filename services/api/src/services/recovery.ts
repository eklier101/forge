import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { syncEntities } from "../db/schema.js";

const BASE_HOURS: Record<string, number> = {
  legs: 72,
  quads: 72,
  hamstrings: 72,
  glutes: 72,
  back: 60,
  chest: 48,
  shoulders: 48,
  biceps: 36,
  triceps: 36,
  abs: 24,
  obliques: 24,
  calves: 36,
  forearms: 24,
  core: 24,
  full: 48,
};

type FatiguePayload = {
  muscles: Record<string, string>; // muscle → ISO last trained
};

export function recoveryPercent(lastTrainedIso: string, muscle: string, now = Date.now()): number {
  const base = BASE_HOURS[muscle] ?? 48;
  const hours = Math.max(0, (now - new Date(lastTrainedIso).getTime()) / 3600000);
  return Math.min(100, Math.round((hours / base) * 100));
}

export async function loadMuscleRecovery(userId: string): Promise<Record<string, number>> {
  const [row] = await db
    .select()
    .from(syncEntities)
    .where(and(eq(syncEntities.userId, userId), eq(syncEntities.id, `muscle-fatigue-${userId}`)));
  if (!row || row.deleted) return {};
  const payload = row.payload as FatiguePayload;
  const out: Record<string, number> = {};
  for (const [muscle, iso] of Object.entries(payload.muscles ?? {})) {
    out[muscle] = recoveryPercent(iso, muscle);
  }
  return out;
}

export async function recordWorkoutFatigue(
  userId: string,
  muscleGroups: string[],
): Promise<void> {
  const now = new Date().toISOString();
  const id = `muscle-fatigue-${userId}`;
  const [row] = await db
    .select()
    .from(syncEntities)
    .where(and(eq(syncEntities.userId, userId), eq(syncEntities.id, id)));
  const muscles = { ...((row?.payload as FatiguePayload | undefined)?.muscles ?? {}) };
  for (const m of muscleGroups) {
    if (m) muscles[m] = now;
  }
  const payload: FatiguePayload = { muscles };
  const updatedAt = new Date();
  if (row) {
    await db
      .update(syncEntities)
      .set({ payload, updatedAt, deleted: false })
      .where(eq(syncEntities.id, id));
  } else {
    await db.insert(syncEntities).values({
      id,
      userId,
      entityType: "muscle_fatigue",
      payload,
      updatedAt,
      deleted: false,
    });
  }
}

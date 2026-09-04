import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { syncEntities } from "../db/schema.js";

export type Difficulty = "too_easy" | "normal" | "too_hard" | "failed";

type Payload = {
  byExercise: Record<string, { difficulty: Difficulty; at: string }>;
};

function entityId(userId: string) {
  return `exercise-difficulty-${userId}`;
}

export async function loadLastDifficulties(userId: string): Promise<Record<string, Difficulty>> {
  const [row] = await db
    .select()
    .from(syncEntities)
    .where(and(eq(syncEntities.userId, userId), eq(syncEntities.id, entityId(userId))));
  if (!row || row.deleted) return {};
  const payload = row.payload as Payload;
  const out: Record<string, Difficulty> = {};
  for (const [id, v] of Object.entries(payload.byExercise ?? {})) {
    if (v?.difficulty) out[id] = v.difficulty;
  }
  return out;
}

export async function recordDifficulties(
  userId: string,
  items: { exerciseId: string; difficulty: Difficulty }[],
): Promise<void> {
  if (!items.length) return;
  const id = entityId(userId);
  const [row] = await db
    .select()
    .from(syncEntities)
    .where(and(eq(syncEntities.userId, userId), eq(syncEntities.id, id)));
  const byExercise = { ...((row?.payload as Payload | undefined)?.byExercise ?? {}) };
  const at = new Date().toISOString();
  for (const item of items) {
    byExercise[item.exerciseId] = { difficulty: item.difficulty, at };
  }
  const payload: Payload = { byExercise };
  const updatedAt = new Date();
  if (row) {
    await db.update(syncEntities).set({ payload, updatedAt, deleted: false }).where(eq(syncEntities.id, id));
  } else {
    await db.insert(syncEntities).values({
      id,
      userId,
      entityType: "exercise_difficulty",
      payload,
      updatedAt,
      deleted: false,
    });
  }
}

/** Adjust suggested load from last difficulty rating. */
export function adjustWeightForDifficulty(weight: number, difficulty?: Difficulty): number {
  if (!weight || !difficulty) return weight;
  if (difficulty === "too_easy") return Math.round(weight + (weight >= 100 ? 5 : 2.5));
  if (difficulty === "too_hard") return Math.max(0, Math.round(weight - (weight >= 100 ? 5 : 2.5)));
  if (difficulty === "failed") return Math.max(0, Math.round(weight * 0.9));
  return weight;
}

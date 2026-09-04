import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { syncEntities } from "../db/schema.js";

export type AffinityScores = Record<string, number>;

type SessionLike = {
  status?: string;
  completedAt?: string;
  startedAt?: string;
  exercises?: {
    exerciseId: string;
    difficulty?: string;
    sets?: { done?: boolean; weight?: number; reps?: number }[];
  }[];
};

/**
 * Learn per-exercise affinity from completed sessions.
 * Higher = prefer this move when building today's plan.
 *
 * Signals: how often you finish it, recent use, difficulty (failed/hard → slight prefer
 * for progression continuity, too_easy → still ok), and working-set completion rate.
 */
export async function loadAffinityScores(userId: string): Promise<AffinityScores> {
  const rows = await db
    .select()
    .from(syncEntities)
    .where(and(eq(syncEntities.userId, userId), eq(syncEntities.entityType, "workout_session")));

  type Acc = {
    appearances: number;
    finished: number; // at least one done set
    setsDone: number;
    setsPlanned: number;
    difficultyPts: number;
    lastAt: number;
  };
  const byId: Record<string, Acc> = {};
  const now = Date.now();

  for (const row of rows) {
    if (row.deleted) continue;
    const session = row.payload as SessionLike;
    if (session.status !== "completed") continue;
    const at = new Date(session.completedAt ?? row.updatedAt.toISOString()).getTime();
    if (!Number.isFinite(at)) continue;
    // Ignore ancient history (> 180d) so tastes can change
    if (now - at > 180 * 24 * 3600_000) continue;

    for (const ex of session.exercises ?? []) {
      if (!ex.exerciseId) continue;
      const acc = (byId[ex.exerciseId] ??= {
        appearances: 0,
        finished: 0,
        setsDone: 0,
        setsPlanned: 0,
        difficultyPts: 0,
        lastAt: 0,
      });
      acc.appearances += 1;
      acc.lastAt = Math.max(acc.lastAt, at);
      const sets = ex.sets ?? [];
      acc.setsPlanned += Math.max(1, sets.length);
      const done = sets.filter((s) => s.done).length;
      acc.setsDone += done;
      if (done > 0) acc.finished += 1;
      if (ex.difficulty === "too_easy") acc.difficultyPts += 0.15;
      else if (ex.difficulty === "normal") acc.difficultyPts += 0.35;
      else if (ex.difficulty === "too_hard") acc.difficultyPts += 0.25; // still did it
      else if (ex.difficulty === "failed") acc.difficultyPts -= 0.2;
    }
  }

  const scores: AffinityScores = {};
  for (const [id, a] of Object.entries(byId)) {
    if (a.appearances < 1) continue;
    const finishRate = a.finished / a.appearances;
    const setRate = a.setsDone / Math.max(1, a.setsPlanned);
    const daysAgo = (now - a.lastAt) / (24 * 3600_000);
    // Recency: recent work boosts; very recent (<2d) mild downrank for variety
    let recency = Math.exp(-daysAgo / 21);
    if (daysAgo < 2) recency *= 0.55;
    else if (daysAgo > 28) recency *= 1.15; // due for a comeback
    const difficulty = a.difficultyPts / a.appearances;
    const volume = Math.min(1, Math.log2(1 + a.appearances) / 4);
    const raw =
      0.35 * finishRate + 0.25 * setRate + 0.2 * recency + 0.1 * (difficulty + 0.5) + 0.1 * volume;
    scores[id] = Math.round(raw * 1000) / 1000;
  }
  return scores;
}

/** Stable sort helper — higher score first; unknown → mid prior. */
export function affinityOf(scores: AffinityScores | undefined, exerciseId: string): number {
  if (!scores) return 0.45;
  const v = scores[exerciseId];
  return typeof v === "number" ? v : 0.4;
}

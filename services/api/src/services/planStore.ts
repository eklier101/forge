import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { syncEntities } from "../db/schema.js";
import type { DayPlan, PlannedExercise } from "./planner.js";

export async function saveWeekPlan(userId: string, plan: DayPlan[]): Promise<void> {
  const now = new Date();
  for (const day of plan) {
    await db
      .insert(syncEntities)
      .values({
        id: `plan-${day.date}`,
        userId,
        entityType: "day_plan",
        payload: day,
        updatedAt: now,
        deleted: false,
      })
      .onConflictDoUpdate({
        target: syncEntities.id,
        set: {
          payload: day,
          updatedAt: now,
          deleted: false,
          entityType: "day_plan",
          userId,
        },
      });
  }
}

export async function loadWeekPlan(userId: string, dates: string[]): Promise<DayPlan[] | null> {
  const days: DayPlan[] = [];
  for (const date of dates) {
    const [row] = await db
      .select()
      .from(syncEntities)
      .where(and(eq(syncEntities.userId, userId), eq(syncEntities.id, `plan-${date}`)));
    if (!row || row.deleted) return null;
    days.push(row.payload as DayPlan);
  }
  return days.length === dates.length ? days : null;
}

export async function saveDayPlan(userId: string, day: DayPlan): Promise<void> {
  const now = new Date();
  await db
    .insert(syncEntities)
    .values({
      id: `plan-${day.date}`,
      userId,
      entityType: "day_plan",
      payload: day,
      updatedAt: now,
      deleted: false,
    })
    .onConflictDoUpdate({
      target: syncEntities.id,
      set: {
        payload: day,
        updatedAt: now,
        deleted: false,
        entityType: "day_plan",
        userId,
      },
    });
}

type SessionLike = {
  status?: string;
  completedAt?: string;
  exercises?: {
    exerciseId: string;
    sets?: { done?: boolean; weight?: number }[];
  }[];
};

/** Latest completed working weight per exercise from synced sessions. */
export async function loadLastWeights(userId: string): Promise<Record<string, number>> {
  const rows = await db
    .select()
    .from(syncEntities)
    .where(and(eq(syncEntities.userId, userId), eq(syncEntities.entityType, "workout_session")));

  const best: Record<string, { weight: number; at: string }> = {};
  for (const row of rows) {
    if (row.deleted) continue;
    const session = row.payload as SessionLike;
    if (session.status !== "completed") continue;
    const at = session.completedAt ?? row.updatedAt.toISOString();
    for (const ex of session.exercises ?? []) {
      const done = [...(ex.sets ?? [])].reverse().find((s) => s.done && (s.weight ?? 0) > 0);
      if (!done?.weight) continue;
      const prev = best[ex.exerciseId];
      if (!prev || at > prev.at) {
        best[ex.exerciseId] = { weight: done.weight, at };
      }
    }
  }

  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(best)) out[id] = v.weight;
  return out;
}

export function applyWeightSuggestions(
  exercises: PlannedExercise[],
  lastWeights: Record<string, number>,
  progressionFocus: string,
): PlannedExercise[] {
  return exercises.map((ex) => {
    const last = lastWeights[ex.exerciseId];
    if (last == null || last <= 0) return ex;
    let suggested = last;
    if (progressionFocus === "weight") {
      // Small progressive overload bump
      suggested = Math.round(last + (last >= 100 ? 5 : 2.5));
    }
    return { ...ex, suggestedWeight: suggested };
  });
}

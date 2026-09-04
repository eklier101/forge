import { listLocalEntities } from "../db/local";
import type { WorkoutSession } from "../types/workout";
import { localToday } from "./dates";

/**
 * Consecutive calendar days (ending today or yesterday) with a completed workout.
 * Miss today but completed yesterday → streak still counts until midnight passes without a session.
 */
export async function computeWorkoutStreak(): Promise<{
  days: number;
  lastDate: string | null;
}> {
  const rows = await listLocalEntities("workout_session");
  const dates = new Set<string>();
  for (const row of rows) {
    const s = row.payload as WorkoutSession & { finishedAt?: string };
    const done =
      s.status === "completed" ||
      Boolean(s.completedAt) ||
      Boolean(s.finishedAt) ||
      // Some older payloads only set completedAt on the session root after finish.
      (typeof (s as { endedAt?: string }).endedAt === "string" && Boolean((s as { endedAt?: string }).endedAt));
    if (!done) continue;
    const d =
      s.date ||
      (s.completedAt ? String(s.completedAt).slice(0, 10) : null) ||
      (s.finishedAt ? String(s.finishedAt).slice(0, 10) : null);
    if (d && /^\d{4}-\d{2}-\d{2}/.test(d)) dates.add(d.slice(0, 10));
  }
  if (!dates.size) return { days: 0, lastDate: null };

  const today = localToday();
  let cursor = today;
  if (!dates.has(today)) {
    // Allow grace: streak alive if yesterday was hit
    cursor = shiftDay(today, -1);
    if (!dates.has(cursor)) return { days: 0, lastDate: maxDate(dates) };
  }

  let days = 0;
  let lastDate: string | null = null;
  while (dates.has(cursor)) {
    days += 1;
    lastDate = cursor;
    cursor = shiftDay(cursor, -1);
  }
  return { days, lastDate };
}

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function maxDate(dates: Set<string>): string | null {
  let best: string | null = null;
  for (const d of dates) {
    if (!best || d > best) best = d;
  }
  return best;
}

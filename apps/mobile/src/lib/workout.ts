import { getPreferences, listLocalEntities, savePreferences, upsertLocalEntity } from "../db/local";
import type { Exercise, WorkoutSession } from "../types/workout";

const ACTIVE_KEY = "active_session_id";

export async function saveSession(session: WorkoutSession) {
  await upsertLocalEntity({
    id: session.sessionId,
    entityType: "workout_session",
    payload: session,
    updatedAt: new Date().toISOString(),
  });
}

export async function getSession(sessionId: string): Promise<WorkoutSession | null> {
  const rows = await listLocalEntities("workout_session");
  const hit = rows.find((r) => r.id === sessionId);
  return hit ? (hit.payload as WorkoutSession) : null;
}

export async function setActiveSessionId(sessionId: string | null) {
  const { setMeta } = await import("../db/local");
  if (sessionId) await setMeta(ACTIVE_KEY, sessionId);
  else await setMeta(ACTIVE_KEY, "");
}

export async function getActiveSession(): Promise<WorkoutSession | null> {
  const { getMeta } = await import("../db/local");
  const id = await getMeta(ACTIVE_KEY);
  if (!id) return null;
  return getSession(id);
}

export async function cacheExercises(exercises: Exercise[]) {
  for (const ex of exercises) {
    await upsertLocalEntity({
      id: `exercise-${ex.id}`,
      entityType: "exercise",
      payload: ex,
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function listCachedExercises(): Promise<Exercise[]> {
  const rows = await listLocalEntities("exercise");
  return rows.map((r) => r.payload as Exercise);
}

/** Suggest last logged weight for an exercise from history. */
export async function lastWeightFor(exerciseId: string): Promise<number | null> {
  const rows = await listLocalEntities("workout_session");
  for (const row of rows) {
    const session = row.payload as WorkoutSession;
    if (session.status !== "completed") continue;
    const ex = session.exercises?.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    const done = [...ex.sets].reverse().find((s) => s.done && s.weight > 0);
    if (done) return done.weight;
  }
  return null;
}

export async function toggleFavorite(exerciseId: string) {
  const prefs = await getPreferences();
  let favorites = [...prefs.favoriteExerciseIds];
  let disliked = [...prefs.dislikedExerciseIds];
  if (favorites.includes(exerciseId)) {
    favorites = favorites.filter((id) => id !== exerciseId);
  } else {
    favorites.push(exerciseId);
    disliked = disliked.filter((id) => id !== exerciseId);
  }
  const next = { ...prefs, favoriteExerciseIds: favorites, dislikedExerciseIds: disliked };
  await savePreferences(next);
  return next;
}

export async function toggleDislike(exerciseId: string) {
  const prefs = await getPreferences();
  let favorites = [...prefs.favoriteExerciseIds];
  let disliked = [...prefs.dislikedExerciseIds];
  if (disliked.includes(exerciseId)) {
    disliked = disliked.filter((id) => id !== exerciseId);
  } else {
    disliked.push(exerciseId);
    favorites = favorites.filter((id) => id !== exerciseId);
  }
  const next = { ...prefs, favoriteExerciseIds: favorites, dislikedExerciseIds: disliked };
  await savePreferences(next);
  return next;
}

/** Completed workout for a calendar day (YYYY-MM-DD). */
export async function getCompletedSessionForDate(dayKey: string): Promise<WorkoutSession | null> {
  const rows = await listLocalEntities("workout_session");
  for (const row of rows) {
    const session = row.payload as WorkoutSession;
    if (session.status !== "completed") continue;
    const date =
      session.completedAt?.slice(0, 10) ??
      session.startedAt?.slice(0, 10) ??
      row.updatedAt.slice(0, 10);
    if (date === dayKey) return session;
  }
  return null;
}

import { getAppSettings } from "./settings.js";

const FOCUS_TITLE_MAP: Record<string, string> = {
  upper: "Upper Body Workout",
  lower: "Lower Body Workout",
  push: "Push Workout",
  pull: "Pull Workout",
  legs: "Legs Workout",
  full: "Full Body Workout",
  chest: "Chest Workout",
  back: "Back Workout",
  shoulders: "Shoulders Workout",
  arms: "Arms Workout",
  home: "Home Workout",
  rest: "Rest Day",
};

export function formatWorkoutTitle(focus?: string | null, kind?: string | null): string {
  const f = (focus ?? "").trim();
  if (!f) {
    return kind === "home" ? "Home Workout" : "Gym Workout";
  }
  const lower = f.toLowerCase();
  if (FOCUS_TITLE_MAP[lower]) {
    return FOCUS_TITLE_MAP[lower];
  }
  if (/\bworkout$/i.test(f)) {
    return f
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  const cap = f.charAt(0).toUpperCase() + f.slice(1);
  return `${cap} Workout`;
}

export type WorkoutPlanSyncPayload = {
  title: string;
  duration_minutes: number;
  due_date: string;
  event_type: "workout_plan";
};

export type WorkoutCompletedSyncPayload = {
  title: string;
  completed: true;
  event_type: "workout_completed";
};

async function getTargetUrl(): Promise<{ enabled: boolean; url: string | null }> {
  try {
    const settings = await getAppSettings();
    if (settings.flowforgeEnabled === false) {
      return { enabled: false, url: null };
    }
    const url = settings.flowforgeSyncUrl?.trim() || process.env.FLOWFORGE_SYNC_URL?.trim() || null;
    if (!url) {
      return { enabled: false, url: null };
    }
    return { enabled: true, url };
  } catch {
    const url = process.env.FLOWFORGE_SYNC_URL?.trim() || null;
    if (!url) {
      return { enabled: false, url: null };
    }
    return { enabled: true, url };
  }
}

async function sendToFlowForge(
  payload: WorkoutPlanSyncPayload | WorkoutCompletedSyncPayload,
): Promise<{ ok: boolean; error?: string }> {
  const target = await getTargetUrl();
  if (!target.enabled || !target.url) {
    return { ok: false, error: "FlowForge integration is not configured" };
  }

  try {
    const res = await fetch(target.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return { ok: false, error: `FlowForge responded with ${res.status}: ${errBody}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "FlowForge sync failed" };
  }
}

export async function syncWorkoutPlanToFlowForge(day: {
  date: string;
  focus?: string | null;
  kind?: string | null;
  targetMinutes?: number | null;
  estimatedMinutes?: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (day.kind === "rest") {
    return { ok: true };
  }

  const title = formatWorkoutTitle(day.focus, day.kind);
  const duration_minutes = Math.round(day.targetMinutes ?? day.estimatedMinutes ?? (day.kind === "home" ? 45 : 60)) || 60;
  const rawDate = String(day.date || "").trim();
  const due_date = rawDate.includes("T") ? rawDate : `${rawDate.slice(0, 10)}T23:59:00Z`;

  const payload: WorkoutPlanSyncPayload = {
    title,
    duration_minutes,
    due_date,
    event_type: "workout_plan",
  };

  return sendToFlowForge(payload);
}

export async function syncWorkoutCompletedToFlowForge(workout: {
  title?: string | null;
  focus?: string | null;
  kind?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const title = workout.title?.trim() || formatWorkoutTitle(workout.focus, workout.kind);
  const payload: WorkoutCompletedSyncPayload = {
    title,
    completed: true,
    event_type: "workout_completed",
  };

  return sendToFlowForge(payload);
}

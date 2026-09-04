import { defaultLoadUnit, type LoadUnit } from "../lib/loadUnit";

export type { LoadUnit };

export type PlannedExercise = {
  exerciseId: string;
  name: string;
  sets: number;
  reps: number;
  restSeconds: number;
  suggestedWeight?: number;
  setLabels?: string[];
};

export type DayPlan = {
  date: string;
  weekday?: number;
  kind: "gym" | "home" | "rest";
  focus: string;
  exercises: PlannedExercise[];
  targetMinutes?: number;
  estimatedMinutes?: number;
};

export type LoggedSet = {
  setIndex: number;
  reps: number;
  weight: number;
  done: boolean;
  completedAt?: string;
  label?: string;
};

export type SessionExercise = {
  exerciseId: string;
  name: string;
  targetSets: number;
  targetReps: number;
  restSeconds: number;
  sets: LoggedSet[];
  /** User tapped Start on this move — reveal set 1. */
  started?: boolean;
  /** Pin/stack level vs free-weight mass. */
  loadUnit?: LoadUnit;
  /** Post-exercise difficulty feedback for auto-regulation */
  difficulty?: "too_easy" | "normal" | "too_hard" | "failed";
};

export type WorkoutSession = {
  sessionId: string;
  date: string;
  kind: "gym" | "home";
  focus: string;
  startedAt: string;
  completedAt?: string;
  status: "active" | "completed";
  /** Round-robin sets across exercises (home preference). */
  circuitMode?: boolean;
  exercises: SessionExercise[];
};

export type Exercise = {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  location: string;
  isCustom?: boolean;
  imageStart?: string | null;
  imageEnd?: string | null;
  instructions?: string[] | null;
};

export function createSessionFromPlan(plan: DayPlan, opts?: { circuitMode?: boolean }): WorkoutSession {
  const sessionId = `session-${plan.date}-${Date.now()}`;
  const kind = plan.kind === "home" ? "home" : "gym";
  return {
    sessionId,
    date: plan.date,
    kind,
    focus: plan.focus,
    startedAt: new Date().toISOString(),
    status: "active",
    circuitMode: kind === "home" ? opts?.circuitMode !== false : false,
    exercises: plan.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      name: ex.name,
      targetSets: ex.sets,
      targetReps: ex.reps,
      restSeconds: ex.restSeconds,
      started: false,
      loadUnit: defaultLoadUnit(ex.exerciseId),
      sets: Array.from({ length: ex.sets }, (_, i) => ({
        setIndex: i + 1,
        reps: ex.reps,
        weight: ex.suggestedWeight ?? 0,
        done: false,
        label: ex.setLabels?.[i],
      })),
    })),
  };
}

/** Machine pin / stack level vs free-weight load. */

export type LoadUnit = "weight" | "level";

/** Body Solid selectorized stack — log pin level, not pounds. */
export const BODY_SOLID_LEVEL_IDS = new Set([
  "chest_press_machine",
  "incline_chest_press_machine",
  "machine_shoulder_press",
  "lat_pulldown",
  "close_grip_lat_pulldown",
  "midrow",
  "seated_row_machine",
  "leg_press",
  "standing_calf_raise",
  "seated_calf_raise",
  "calf_press_leg_press",
]);

/** Free-weight / smith — log real pounds (or kg). */
export const FREE_WEIGHT_PRESS_IDS = new Set([
  "bench_press",
  "incline_bench_press",
  "decline_bench_press",
  "dumbbell_bench_press",
  "incline_dumbbell_press",
  "decline_dumbbell_press",
  "smith_bench_press",
  "ez_bar_curl",
  "preacher_curl",
]);

export function defaultLoadUnit(exerciseId: string): LoadUnit {
  if (BODY_SOLID_LEVEL_IDS.has(exerciseId)) return "level";
  return "weight";
}

export function loadUnitLabel(unit: LoadUnit, massUnit: string): string {
  return unit === "level" ? "lvl" : massUnit;
}

export function loadUnitLongLabel(unit: LoadUnit, massUnit: string): string {
  return unit === "level" ? "Level (pin)" : massUnit;
}

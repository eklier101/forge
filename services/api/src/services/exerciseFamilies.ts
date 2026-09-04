/**
 * Movement families — planner keeps at most one exercise per family per day
 * (e..g. no barbell bench + smith bench in the same workout).
 */
export const EXERCISE_FAMILY: Record<string, string> = {
  bench_press: "horizontal_press",
  incline_bench_press: "horizontal_press",
  decline_bench_press: "horizontal_press",
  dumbbell_bench_press: "horizontal_press",
  incline_dumbbell_press: "horizontal_press",
  decline_dumbbell_press: "horizontal_press",
  smith_bench_press: "horizontal_press",
  chest_press_machine: "horizontal_press",
  incline_chest_press_machine: "incline_press",
  band_chest_press: "horizontal_press",
  push_up: "horizontal_press",
  lat_pulldown: "lat_pulldown",
  close_grip_lat_pulldown: "lat_pulldown",
  machine_shoulder_press: "overhead_press",
  dumbbell_shoulder_press: "overhead_press",
  overhead_press: "overhead_press",
  military_press: "overhead_press",
  midrow: "midrow",
  seated_row_machine: "midrow",
  seated_cable_row: "midrow",
  standing_calf_raise: "calf_raise",
  seated_calf_raise: "calf_raise",
  dumbbell_calf_raise: "calf_raise",
  smith_calf_raise: "calf_raise",
  calf_press_leg_press: "calf_raise",
};

export function exerciseFamily(id: string): string {
  return EXERCISE_FAMILY[id] ?? id;
}

/** Take up to `count` exercises with at most one per movement family. */
export function pickUniqueFamilies<T extends { id: string }>(pool: T[], count: number): T[] {
  const chosen: T[] = [];
  const families = new Set<string>();
  for (const ex of pool) {
    if (chosen.length >= count) break;
    const fam = exerciseFamily(ex.id);
    if (families.has(fam)) continue;
    families.add(fam);
    chosen.push(ex);
  }
  return chosen;
}

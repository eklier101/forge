/** Warmup load suggestions for weight-focused sessions. */

export type WarmupStep = { weight: number; reps: number; label: string; detail?: string };

export type WarmupEquipment = "barbell" | "dumbbell" | "other";

export function classifyEquipment(equipment?: string): WarmupEquipment {
  const e = (equipment ?? "").toLowerCase();
  if (e.includes("dumbbell") || e === "db") return "dumbbell";
  if (
    e.includes("barbell") ||
    e.includes("ez_bar") ||
    e.includes("ez-bar") ||
    e.includes("smith") ||
    e === "bar"
  ) {
    return "barbell";
  }
  return "other";
}

/**
 * Barbell: `workingWeight` is total on the bar (one number).
 * Dumbbell: `workingWeight` is each dumbbell (one number per hand).
 */
export function warmupSteps(
  workingWeight: number,
  units: "lb" | "kg" = "lb",
  equipment?: string,
): WarmupStep[] {
  if (!workingWeight || workingWeight <= 0) return [];
  const kind = classifyEquipment(equipment);
  if (kind === "other") return [];

  const targets =
    kind === "dumbbell"
      ? [
          { pct: 0.5, reps: 8, label: "Warmup" },
          { pct: 0.7, reps: 5, label: "Feeler" },
          { pct: 0.85, reps: 3, label: "Heavy feeler" },
        ]
      : [
          { pct: 0.4, reps: 8, label: "Empty / light" },
          { pct: 0.6, reps: 5, label: "Warmup" },
          { pct: 0.8, reps: 3, label: "Feeler" },
        ];

  const bar = units === "kg" ? 20 : 45;
  const minLoad = kind === "dumbbell" ? (units === "kg" ? 2.5 : 5) : bar;

  return targets
    .map((t) => {
      const raw = Math.max(minLoad, workingWeight * t.pct);
      const rounded =
        units === "kg" ? Math.round(raw / 2.5) * 2.5 : Math.round(raw / 5) * 5;
      const detail =
        kind === "dumbbell"
          ? `${rounded} ${units} each`
          : `bar total ${rounded} ${units}`;
      return { weight: rounded, reps: t.reps, label: t.label, detail };
    })
    .filter((s, i, arr) => i === 0 || s.weight > arr[i - 1].weight);
}

/** Plate breakdown for barbell totals only (plates per side). */
export function platesPerSide(totalWeight: number, units: "lb" | "kg" = "lb"): string {
  const bar = units === "kg" ? 20 : 45;
  let each = (totalWeight - bar) / 2;
  if (each <= 0) return "bar only";
  const inventory = units === "kg" ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5];
  const used: string[] = [];
  for (const p of inventory) {
    while (each + 0.01 >= p) {
      used.push(String(p));
      each -= p;
    }
  }
  return used.length ? used.join(" + ") : "bar only";
}

export function warmupLine(
  step: WarmupStep,
  units: "lb" | "kg",
  equipment?: string,
): string {
  const kind = classifyEquipment(equipment);
  if (kind === "dumbbell") {
    return `${step.label}: ${step.weight} ${units} each × ${step.reps}`;
  }
  if (kind === "barbell") {
    return `${step.label}: ${step.weight} ${units} total × ${step.reps} · ${platesPerSide(step.weight, units)} / side`;
  }
  return `${step.label}: ${step.weight} ${units} × ${step.reps}`;
}

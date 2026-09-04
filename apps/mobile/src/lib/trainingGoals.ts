/** Training / physique goals that drive nutrition surplus/deficit and plan bias. */
export type TrainingGoalId = "recomp" | "cut" | "bulk" | "shred" | "maintain";

export type TrainingGoal = {
  id: TrainingGoalId;
  label: string;
  blurb: string;
  /** Calorie delta vs maintenance (negative = deficit). */
  calorieDelta: number;
  /** Protein g per lb bodyweight target. */
  proteinPerLb: number;
  /** Carb share of remaining calories after protein/fat (0–1). */
  carbBias: number;
};

export const TRAINING_GOALS: TrainingGoal[] = [
  {
    id: "recomp",
    label: "Lose fat · gain muscle",
    blurb: "Slight deficit, high protein — body recomposition.",
    calorieDelta: -200,
    proteinPerLb: 1.0,
    carbBias: 0.45,
  },
  {
    id: "cut",
    label: "Lose fat",
    blurb: "Steady fat loss with enough protein to keep muscle.",
    calorieDelta: -400,
    proteinPerLb: 1.05,
    carbBias: 0.4,
  },
  {
    id: "shred",
    label: "Get shredded",
    blurb: "Aggressive cut — leaner look, harder training recovery.",
    calorieDelta: -550,
    proteinPerLb: 1.15,
    carbBias: 0.35,
  },
  {
    id: "bulk",
    label: "Bulk / build",
    blurb: "Surplus for muscle gain — expect some fat gain.",
    calorieDelta: 300,
    proteinPerLb: 0.9,
    carbBias: 0.5,
  },
  {
    id: "maintain",
    label: "Maintain",
    blurb: "Hold weight — balanced macros.",
    calorieDelta: 0,
    proteinPerLb: 0.85,
    carbBias: 0.45,
  },
];

export function trainingGoal(id: string | null | undefined): TrainingGoal {
  return TRAINING_GOALS.find((g) => g.id === id) ?? TRAINING_GOALS[0]!;
}
